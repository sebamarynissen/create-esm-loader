// # create-loader-test.js
import fs from 'fs/promises';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import create from 'create-esm-loader';
import chai, { expect } from './chai.js';

const self = './create-loader-test.js';

describe('The create loader function', function() {

	before(function() {
		this.create = function(...opts) {
			return this.loader = create(...opts);
		};

		// The mocks for Node's default loader hooks.
		function defaultResolve(specifier, ctx) {
			let { parentURL } = ctx;
			let url = new URL(specifier, parentURL);
			return { url: url.href };
		}

		// Note: we're only testing es modules here. Node normally performs 
		// its checks here whether we're loading an internal module, an es 
		// module, commonjs, wasm, ...
		function defaultGetFormat(url, ctx) {
			return { format: 'module' };
		}

		// Mock of Node getting the source for a file.
		async function defaultGetSource(url, ctx) {
			let file = fileURLToPath(url);
			let source = await fs.readFile(file);
			return { source };
		}

		// Mock of Node's default transform source. Does obviously nothing.
		async function defaultTransformSource(source, ctx) {
			return { source };
		}

		// The method for testing the import process of a specifier. We mock 
		// how node does it here.
		this.import = async function(specifier) {
			const { loader } = this;
			const { resolve, getFormat, getSource, transformSource } = loader;

			// Mock Node calling the resolve hook.
			let parentURL = import.meta.url;
			let { url } = await resolve(
				specifier,
				{ parentURL },
				defaultResolve
			);

			// Mock Node calling the getFormat hook.
			let { format } = await getFormat(
				url,
				{},
				defaultGetFormat,
			);

			// Mock Node calling the getSource hook.
			let { source } = await getSource(
				url,
				{ format },
				defaultGetSource,
			);

			// At last mock transforming the source.
			let code = await transformSource(
				source,
				{ url, format },
				defaultTransformSource,
			);
			return String(code.source);

		};

	});

	it('uses a specific resolver', async function() {

		const __dirname = path.dirname(fileURLToPath(import.meta.url));
		this.create({
			resolve(specifier, ctx) {
				if (specifier.startsWith('@')) {
					let name = specifier.slice(1);
					let file = path.join(__dirname, 'files', name);
					let url = pathToFileURL(file).href;
					return { url };
				}
			},
		});
		let file = path.join(__dirname, 'files/source.js');
		let src = await this.import('@source.js');
		let contents = await fs.readFile(file);
		expect(contents+'').to.equal(src);

	});

});
