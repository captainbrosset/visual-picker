/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function pick() {
  showOverlay();

  return new Promise(resolve => {
    addEventListener("click", e => {
      hideOverlay();
      resolve({ x: e.pageX, y: e.pageY });
    }, {once: true});
  });
}

let overlay = null;
const OVERLAY_ID = "__visual_picker_overlay";

function showOverlay() {
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style = "position:absolute;top:0;left:0;bottom:0;right:0;z-index:2147483647;";
  document.body.appendChild(overlay);
}

function hideOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

// !! should also update it on markup mutations.
const ELEMENT_CACHE = new Set();

function initElementCache() {
  const allEls = [...document.querySelectorAll("*")];
  for (const el of allEls) {
    if (!el.getBoxQuads || !el.getBoxQuads().length) {
      continue;
    }

    ELEMENT_CACHE.add(el);
  }
}

function isPointInRects(x, y, rects) {
  for (const {p1, p2, p3, p4} of rects) {
    if (x >= p1.x && x <= p2.x && y >= p1.y && y <= p4.y) {
      return true;
    }
  }

  return false;
}

/**
 * Given 2 nested lists of quads, return a list of rectangles that cover the space between
 * the outer and inner quads.
 * !! This assumes quads are always rectangular!!
 */
function createRectsForQuads(outerQuads, innerQuads) {
  const rects = [];

  outerQuads.forEach((outerQuad, i) => {
    const innerQuad = innerQuads[i];

    // Top margin
    rects.push({
      p1: outerQuad.p1,
      p2: outerQuad.p2,
      p3: {x: outerQuad.p2.x, y: innerQuad.p2.y},
      p4: {x: outerQuad.p1.x, y: innerQuad.p1.y},
    });

    // Right margin
    rects.push({
      p1: {x: innerQuad.p2.x, y: outerQuad.p1.y},
      p2: outerQuad.p2,
      p3: outerQuad.p3,
      p4: {x: innerQuad.p3.x, y: outerQuad.p4.y},
    });

    // Bottom margin
    rects.push({
      p1: {x: outerQuad.p1.x, y: innerQuad.p4.y},
      p2: {x: outerQuad.p2.x, y: innerQuad.p3.y},
      p3: outerQuad.p3,
      p4: outerQuad.p4,
    });

    // Left margin
    rects.push({
      p1: outerQuad.p1,
      p2: {x: innerQuad.p1.x, y: outerQuad.p1.y},
      p3: {x: innerQuad.p4.x, y: outerQuad.p4.y},
      p4: outerQuad.p4,
    });
  });

  return rects;
}

function findElementsContributingToLocation(x, y) {
  if (!ELEMENT_CACHE.size) {
    initElementCache();
  }

  const contributingEls = [];

  for (const el of ELEMENT_CACHE) {
    if (el.id === OVERLAY_ID) {
      continue;
    }

    // Get the various boxes for the element.
    const marginQuads = el.getBoxQuads({
      box: "margin",
      relativeTo: document.documentElement
    });
    const borderQuads = el.getBoxQuads({
      box: "border",
      relativeTo: document.documentElement
    });
    const paddingQuads = el.getBoxQuads({
      box: "padding",
      relativeTo: document.documentElement
    });
    const contentQuads = el.getBoxQuads({
      box: "content",
      relativeTo: document.documentElement
    });

    // Check if the point is included in any of the regions between these boxes.
    if (isPointInRects(x, y, createRectsForQuads(marginQuads, borderQuads))) {
      contributingEls.push({ el, reason: "margin" });
    } else if (isPointInRects(x, y, createRectsForQuads(borderQuads, paddingQuads))) {
      contributingEls.push({ el, reason: "border" });
    } else if (isPointInRects(x, y, createRectsForQuads(paddingQuads, contentQuads))) {
      contributingEls.push({ el, reason: "padding" });
    }
  }

  return contributingEls;
}

function findCssSelector(ele) {
  let cssEscape = window.CSS.escape;

  // document.querySelectorAll("#id") returns multiple if elements share an ID
  if (ele.id && document.querySelectorAll("#" + cssEscape(ele.id)).length === 1) {
    return "#" + cssEscape(ele.id);
  }

  // Inherently unique by tag name
  let tagName = ele.localName;
  if (tagName === "html") {
    return "html";
  }
  if (tagName === "head") {
    return "head";
  }
  if (tagName === "body") {
    return "body";
  }

  // We might be able to find a unique class name
  let selector, index, matches;
  for (let i = 0; i < ele.classList.length; i++) {
    // Is this className unique by itself?
    selector = "." + cssEscape(ele.classList.item(i));
    matches = document.querySelectorAll(selector);
    if (matches.length === 1) {
      return selector;
    }
    // Maybe it's unique with a tag name?
    selector = cssEscape(tagName) + selector;
    matches = document.querySelectorAll(selector);
    if (matches.length === 1) {
      return selector;
    }
    // Maybe it's unique using a tag name and nth-child
    index = positionInNodeList(ele, ele.parentNode.children) + 1;
    selector = selector + ":nth-child(" + index + ")";
    matches = document.querySelectorAll(selector);
    if (matches.length === 1) {
      return selector;
    }
  }

  // Not unique enough yet.
  index = positionInNodeList(ele, ele.parentNode.children) + 1;
  selector = cssEscape(tagName) + ":nth-child(" + index + ")";
  if (ele.parentNode !== document) {
    selector = findCssSelector(ele.parentNode) + " > " + selector;
  }
  return selector;
}

function positionInNodeList(element, nodeList) {
  for (let i = 0; i < nodeList.length; i++) {
    if (element === nodeList[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Create a serializable response that represents a single node in the page, which can be
 * sent to the devtools panel.
 * @param {DOMNode} node The DOM node to be represented in the response.
 * @return {Object} The response object.
 */
function createNodeResponse({ el, reason }) {
  // Getting all attributes as simple {name, value} objects.
  let attributes = [...el.attributes].map(({ name, value }) => ({ name, value }));

  return {
    nodeName: el.nodeName,
    attributes,
    reason,
    uniqueSelector: findCssSelector(el)
  };
}

async function handlePickMessage() {
  const { x, y } = await pick();
  const elements = findElementsContributingToLocation(x, y);
  return { elements: elements.map(createNodeResponse) };
}

// Open the port to communicate with the background script.
const browser = window.browser || chrome;
const port = browser.runtime.connect({ name: "cs-port" });

// Handle background script messages.
port.onMessage.addListener(message => {
  switch (message.action) {
    case "pick":
      handlePickMessage().then(response => sendResponse(response));
      break;
  }
});

// Helper to send messages back to the background script.
function sendResponse(message) {
  port.postMessage(message);
}
