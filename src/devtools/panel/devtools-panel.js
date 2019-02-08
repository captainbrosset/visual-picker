/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";


const browser = window.browser || chrome;

const pickerButtonEl = document.querySelector("#picker-button");
const elementsListEl = document.querySelector("#elements-list");

pickerButtonEl.addEventListener("click", handlePickerButtonClick);

addEventListener("click", handleElementClick);

function handlePickerButtonClick() {
  browser.runtime.sendMessage({
    tabId: browser.devtools.inspectedWindow.tabId,
    action: "pick",
  });
}

function handleElementClick(e) {
  if (!e.target.closest(".element")) {
    return;
  }

  const selector = e.target.dataset.selector;
  browser.devtools.inspectedWindow.eval(`inspect(document.querySelector("${selector}"))`);
}

// Handle messages from the background script.
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.tabId !== browser.devtools.inspectedWindow.tabId) {
    return;
  }

  populateList(request.elements);
});

function clearList() {
  while (elementsListEl.firstChild) {
    elementsListEl.firstChild.remove();
  }
}

function populateList(elements) {
  clearList();

  for (const { nodeName, attributes, reason, uniqueSelector } of elements) {
    const elementEl = document.createElement("li");
    elementEl.classList.add("element");
    elementEl.dataset.selector = uniqueSelector;

    elementEl.appendChild(createNodePreview(nodeName, attributes));
    elementEl.appendChild(createReasonPreview(reason));

    elementsListEl.appendChild(elementEl);
  }
}

function createReasonPreview(reason) {
  const preview = document.createElement("span");
  preview.classList.add("reason-preview");
  preview.textContent = reason;

  return preview;
}

function createNodePreview(nodeName, attributes) {
  const preview = document.createElement("span");
  preview.classList.add("node-preview");

  const name = document.createElement("span");
  name.classList.add("tag");
  name.textContent = nodeName.toLowerCase();
  preview.appendChild(name);

  const idAttr = attributes.find(i => i.name === "id");
  if (idAttr) {
    const attribute = document.createElement("span");
    attribute.classList.add("attribute", "id");
    attribute.textContent = "#" + idAttr.value;
    preview.appendChild(attribute);
  }

  const classAttr = attributes.find(i => i.name === "class");
  if (classAttr) {
    const attribute = document.createElement("span");
    attribute.classList.add("attribute", "class");
    attribute.textContent = "."+ classAttr.value.split(" ").join(".");
    preview.appendChild(attribute);
  }

  return preview;
}
