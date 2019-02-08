# Visual Picker

This browser extension adds a new sidebar to the Inspector/Element panel. The sidebar allows users to click anywhere in the page and get a list of elements that contribute to this space, and why.

*This is only a proof of concept and has lots of bugs*

![visual picker demo](/visual-picker.gif)

## How to install it

* Make sure you have Firefox Nightly installed
* Download or clone this repo
* Open Firefox Nightly
* Go to about:debugging
* Click on the "load a temporary addon" button
* In the file picker, locate your clone of the repository, and select the /src/manifest.json file

## How to use the extension

* Open a new tab on some website you'd like to test this on
* Opn the Inspector, and switch to the new "Visual Picker" sidebar tab
* Click on the Pick button
* Click somewhere in the page

The sidebar panel should update and show the list of elements that contribute to the clicked location.

It will list all elements that have either a border, padding or margin area at this location.

Clicking any of the elements in the list will select it in the inspector.

## How to reload the extension after you made a change

* Close DevTools
* Go back to about:debugging
* Click on the reload button next to the extension entry
* Reload your test page, and re-open DevTools
