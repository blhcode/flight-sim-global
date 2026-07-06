import * as THREE from 'three';
import './style.css';
import { configureTileRendering } from './world/configureTileRendering.ts';

configureTileRendering();

import { Game } from './app/Game.ts';

// three-tile loads cross-origin tile images; anonymous CORS is required for WebGL textures.
const imageLoad = THREE.ImageLoader.prototype.load;
THREE.ImageLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  this.setCrossOrigin('anonymous');
  return imageLoad.call(this, url, onLoad, onProgress, onError);
};

const imageLoadAsync = THREE.ImageLoader.prototype.loadAsync;
THREE.ImageLoader.prototype.loadAsync = function (url) {
  this.setCrossOrigin('anonymous');
  return imageLoadAsync.call(this, url);
};

const fileLoad = THREE.FileLoader.prototype.load;
THREE.FileLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  this.setCrossOrigin('anonymous');
  return fileLoad.call(this, url, onLoad, onProgress, onError);
};

const fileLoadAsync = THREE.FileLoader.prototype.loadAsync;
THREE.FileLoader.prototype.loadAsync = function (url) {
  this.setCrossOrigin('anonymous');
  return fileLoadAsync.call(this, url);
};

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app not found');

const game = new Game(root);
(window as unknown as { __fsg: Game }).__fsg = game;

window.addEventListener('beforeunload', () => game.dispose());
