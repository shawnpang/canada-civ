import {writeHash} from './hash.js';

// The map canvas is already painted with the active lens and other map layers.
// Copying it avoids changing the live camera or relying on external services.
let app;
let root;
let trigger;
let overlay;
let dialog;
let urlInput;
let status;
let copyButton;
let downloadButton;
let closeButton;
let heading;
let lastStatus = '';

const words = {
  en: {
    share: 'Share', title: 'Share this view', close: 'Close',
    url: 'Link to this view', copy: 'Copy link', download: 'Download PNG',
    copied: 'Link copied.', manual: 'Select and copy the link above.',
    failed: 'The image could not be downloaded.',
    credit: 'Canada Civ · Statistics Canada / Natural Resources Canada data · Inspired by usaciv',
    licences: 'Statistics Canada Open Licence · Open Government Licence – Canada'
  },
  fr: {
    share: 'Partager', title: 'Partager cette vue', close: 'Fermer',
    url: 'Lien vers cette vue', copy: 'Copier le lien', download: 'Télécharger le PNG',
    copied: 'Lien copié.', manual: 'Sélectionnez et copiez le lien ci-dessus.',
    failed: 'Impossible de télécharger l’image.',
    credit: 'Canada Civ · Données de Statistique Canada / Ressources naturelles Canada · Inspiré de usaciv',
    licences: 'Licence ouverte de Statistique Canada · Licence du gouvernement ouvert – Canada'
  }
};

function strings() {
  return words[app?.getLang?.() === 'fr' ? 'fr' : 'en'];
}

function currentLink() {
  // Flush the latest camera position before capturing the URL.
  writeHash(app);
  return window.location.href;
}

function localize() {
  if (!root) return;
  const text = strings();
  trigger.textContent = text.share;
  heading.textContent = text.title;
  closeButton.setAttribute('aria-label', text.close);
  urlInput.setAttribute('aria-label', text.url);
  copyButton.textContent = text.copy;
  downloadButton.textContent = text.download;
  status.textContent = lastStatus ? text[lastStatus] : '';
}

function open() {
  urlInput.value = currentLink();
  lastStatus = '';
  status.textContent = '';
  overlay.hidden = false;
  closeButton.focus();
}

function close() {
  overlay.hidden = true;
  trigger.focus();
}

function message(key) {
  lastStatus = key;
  status.textContent = strings()[key];
}

async function copyLink() {
  urlInput.value = currentLink();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(urlInput.value);
      message('copied');
      return;
    }
  } catch (_) {
    // Clipboard access can be denied, even on a secure origin.
  }
  urlInput.focus();
  urlInput.select();
  try {
    if (document.execCommand('copy')) {
      message('copied');
      return;
    }
  } catch (_) {
    // The selected URL remains available for manual copying.
  }
  message('manual');
}

function downloadImage() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context || !app.canvas.width || !app.canvas.height) throw new Error('Canvas unavailable');
    context.fillStyle = '#172c31';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const mapHeight = 824;
    const scale = Math.min(canvas.width / app.canvas.width, mapHeight / app.canvas.height);
    const width = app.canvas.width * scale;
    const height = app.canvas.height * scale;
    context.drawImage(app.canvas, (canvas.width - width) / 2, (mapHeight - height) / 2, width, height);
    context.fillStyle = '#172326';
    context.fillRect(0, mapHeight, canvas.width, canvas.height - mapHeight);
    context.fillStyle = '#f6edcf';
    context.font = '22px sans-serif';
    context.textAlign = 'center';
    context.fillText(strings().credit, canvas.width / 2, 852, 1540);
    context.font = '19px sans-serif';
    context.fillText(strings().licences, canvas.width / 2, 882, 1540);
    const link = document.createElement('a');
    link.download = 'canada-civ.png';
    link.href = canvas.toDataURL('image/png');
    // Some browsers require a connected anchor for a download click.
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } catch (_) {
    message('failed');
  }
}

export async function init(ctx) {
  app = ctx;
  root = document.querySelector('#share-root');
  if (!root) return;

  trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'share-trigger';
  trigger.addEventListener('click', open);

  overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  dialog = document.createElement('section');
  dialog.className = 'share-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'share-title');
  heading = document.createElement('h2');
  heading.id = 'share-title';
  closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'share-close';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', close);
  urlInput = document.createElement('input');
  urlInput.className = 'share-url';
  urlInput.type = 'text';
  urlInput.readOnly = true;
  urlInput.addEventListener('focus', () => urlInput.select());
  const actions = document.createElement('div');
  actions.className = 'share-actions';
  copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.addEventListener('click', copyLink);
  downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.addEventListener('click', downloadImage);
  actions.append(copyButton, downloadButton);
  status = document.createElement('p');
  status.className = 'share-status';
  status.setAttribute('role', 'status');
  dialog.append(closeButton, heading, urlInput, actions, status);
  overlay.append(dialog);
  root.append(trigger);
  document.body.append(overlay);
  document.addEventListener('keydown', event => {
    if (!overlay.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  });
  localize();
}

export function onRedraw(ctx) { app = ctx; }
export function onLang(ctx) { app = ctx; localize(); }
export function onHash(ctx) { app = ctx; }
export function onClick(ctx, mapEvent) {}
