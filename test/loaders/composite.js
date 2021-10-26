// # composite.js
import create from 'create-esm-loader';
import http from './http.js';
import transpiler from './transpiler.js';

export const { resolve, getFormat, getSource, transformSource, load } = await create([
	http,
	transpiler,
]);
