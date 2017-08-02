(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

/* globals messageDiv promptInput mainForm cancelBtn beakerBrowser */

// exported api
// =

window.setup = async function (opts) {
  if (opts.message) {
    messageDiv.textContent = '' + opts.message;
  } else {
    messageDiv.textContent = 'Please enter a value';
  }
  if (opts.default) {
    promptInput.value = '' + opts.default;
  }
  mainForm.addEventListener('submit', onSubmit);
  cancelBtn.addEventListener('click', e => beakerBrowser.closeModal());
};

// event handlers
// =

window.addEventListener('keyup', e => {
  if (e.which === 27) {
    beakerBrowser.closeModal();
  }
});

function onSubmit (e) {
  e.preventDefault();
  beakerBrowser.closeModal(null, {value: promptInput.value});
}

},{}]},{},[1]);
