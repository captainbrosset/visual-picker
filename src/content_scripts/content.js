/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let isPicking = false;

function pick() {
  isPicking = true;
  showOverlay();

  return new Promise(resolve => {
    function onMove(e) {
      const elements = findElementsContributingToLocation(e.pageX, e.pageY);
      drawRects(elements.map(el => {
        return Object.assign(el.rect, { type: el.reason });
      }));
    }

    addEventListener("mousemove", onMove);

    addEventListener("click", e => {
      isPicking = false;
      hideOverlay();
      removeEventListener("mousemove", onMove);
      resolve({ x: e.pageX, y: e.pageY });
    }, {once: true});
  });
}

let overlay = null;
const OVERLAY_ID = "__visual_picker_overlay";

const RECT_STYLES = {
  margin: "background:#edff64;opacity:.6;",
  border: "background:#444444;opacity:.6;",
  padding: "background:#6a5acd;opacity:.6;",
  content: "border:1px solid #87ceeb;",
  text: "background:#aaa5;",
};

function drawRects(rects) {
  if (!overlay) {
    return;
  }

  [...overlay.querySelectorAll("*")].forEach(rectEl => rectEl.remove());

  for (const { p1, p2, p3, p4, type } of rects) {
    const rectEl = document.createElement("div");
    rectEl.style = `position:absolute;top:${p1.y}px;left:${p1.x}px;
                    width:${p2.x - p1.x}px;height:${p4.y - p1.y}px;
                    ${RECT_STYLES[type]}
                    overflow:hidden;display:flex;justify-content:center;align-items:center;
                    font-size:9px;font:verdana;cursor:pointer;`;
    overlay.appendChild(rectEl);
  }
}

let oldDocumentElementPosition = "";

function showOverlay() {
  oldDocumentElementPosition = document.documentElement.style.position;
  document.documentElement.style.position = "relative";

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style = `position:absolute;top:0;left:0;bottom:0;right:0;z-index:2147483647;
                   overflow:hidden;cursor:pointer;`;
  document.body.appendChild(overlay);
}

function hideOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;

    document.documentElement.style.position = oldDocumentElementPosition;
  }
}

// !! should also update it on markup mutations.
const ELEMENT_CACHE = new Set();

function initElementCache() {
  ELEMENT_CACHE.add(document.documentElement);

  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: node => {
        if (node.getBoxQuads && node.getBoxQuads().length) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });

  while (walker.nextNode()) {
    ELEMENT_CACHE.add(walker.currentNode);
  }
}

function isPointInRects(x, y, rects) {
  for (const {p1, p2, p3, p4} of rects) {
    if (x >= p1.x && x <= p2.x && y >= p1.y && y <= p4.y) {
      return { p1, p2, p3, p4 };
    }
  }

  return null;
}

/**
 * Given 2 nested lists of quads, return a list of rectangles that cover the space between
 * the outer and inner quads.
 * !! This assumes quads are always rectangular!!
 */
function createRectsForQuads(outerQuads, innerQuads) {
  const rects = [];

  outerQuads.forEach((outerQuad, i) => {
    if (!innerQuads) {
      rects.push(outerQuad);
      return;
    }

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
    let rect = isPointInRects(x, y, createRectsForQuads(marginQuads, borderQuads));
    if (rect) {
      rect.type = "margin";
      contributingEls.push({ el, reason: "margin", rect });
      continue;
    }

    rect = isPointInRects(x, y, createRectsForQuads(borderQuads, paddingQuads));
    if (rect) {
      rect.type = "border";
      contributingEls.push({ el, reason: "border", rect });
      continue;
    }

    rect = isPointInRects(x, y, createRectsForQuads(paddingQuads, contentQuads));
    if (rect) {
      rect.type = "padding";
      contributingEls.push({ el, reason: "padding", rect });
      continue;
    }

    rect = isPointInRects(x, y, createRectsForQuads(contentQuads));
    if (rect) {
      const reason = el.nodeType === el.TEXT_NODE ? "text" : "content";
      rect.type = reason;
      contributingEls.push({ el, reason, rect });
    }
  }

  return contributingEls.reverse();
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
  if (el.attributes) {
    // For element nodes
    // Getting all attributes as simple {name, value} objects.
    let attributes = [...el.attributes].map(({ name, value }) => ({ name, value }));

    return {
      nodeName: el.nodeName,
      attributes,
      reason,
      uniqueSelector: findCssSelector(el)
    };
  } else {
    // For text nodes
    return {
      nodeName: el.nodeName,
      reason: "text",
      uniqueSelector: findCssSelector(el.parentElement)
    };
  }
}

let LAST_RESPONSE = null;

async function handlePickMessage() {
  const { x, y } = await pick();
  const elements = findElementsContributingToLocation(x, y);
  LAST_RESPONSE = elements;
  return { elements: elements.map(createNodeResponse) };
}

function handleHighlightMessage(index) {
  const element = LAST_RESPONSE[index];
  if (!element) {
    return;
  }

  hideOverlay();
  showOverlay();
  drawRects([element.rect]);
}

function handleUnhighlightMessage() {
  hideOverlay();
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
    case "highlight":
      if (!isPicking) {
        handleHighlightMessage(message.index);
      }
      break;
    case "unhighlight":
      if (!isPicking) {
        handleUnhighlightMessage();
      }
      break;
  }
});

// Helper to send messages back to the background script.
function sendResponse(message) {
  port.postMessage(message);
}
