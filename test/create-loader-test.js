// # create-loader-test.js
import fs from 'fs/promises';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import create, { keys } from 'create-esm-loader';
import chai, { expect } from './chai.js';

const self = './create-loader-test.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('The create loader function', function() {

	// Helper function for mocking a loader definition all witht he same 
	// function.
	function $(fn) {
		return keys.reduce((mem, key) => {
			mem[key] = fn;
			return mem;
		}, {});
	}

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

	it('passes global options to the hooks', async function() {

		let options = { foo: 'bar' };
		let spy = chai.spy((_, ctx) => {
			expect(ctx).to.have.property('foo');
		});
		this.create({
			loaders: [$(spy)],
			options,
		});

		await this.import(self);
		expect(spy).to.have.been.called(4);

	});

	it('passes local options to the hooks', async function() {

		let spy = chai.spy((_, ctx) => {
			expect(ctx).to.have.property('local');
			expect(ctx).to.have.property('global');
			expect(ctx.local).to.be.true;
			expect(ctx.global).to.be.true;
		});
		this.create({
			loaders: [{
				hooks: $(spy),
				options: {
					local: true,
				},
			}],
			options: {
				global: true,
			},
		});

		await this.import(self);
		expect(spy).to.have.been.called(4);

	});

	it('uses a loader from a file', async function() {

		let source = 'export const foo = "bar";';
		let file = path.join(__dirname, 'files/file-loader.js');
		let url = pathToFileURL(file).href;
		this.create({
			loaders: [url],
			options: {
				source,
			},
		});
		let src = await this.import(self);
		expect(src).to.equal(source);


	});

	it('uses a loader from a file while passing the options', async function() {

		let file = path.join(__dirname, 'files/file-loader.js');
		let url = pathToFileURL(file).href;
		this.create({
			loaders: [{
				loader: url,
				options: {
					foo: 'bar',
				},
			}],
		});
		let src = await this.import(self);
		expect(src).to.equal('null');

	});

	it('uses a loader from a file as only option', async function() {

		let file = path.join(__dirname, 'files/file-loader.js');
		let url = pathToFileURL(file).href;
		this.create(url);
		let src = await this.import(self);
		expect(src).to.equal('null');

	});

	it('uses a combination of loaders', async function() {

		let one = {
			resolve(specifier) {
				if (specifier.startsWith('@')) {
					let name = specifier.slice(1);
					let file = path.join(__dirname, 'files', name);
					let url = pathToFileURL(file).href;
					return { url };
				}
			},
		};
		let two = {
			transform(source) {
				return { source: String(source).repeat(2) };
			},
		};

		this.create({
			loaders: [one, two],
		});
		let src = await this.import('@source.js');
		let file = path.join(__dirname, 'files/source.js');
		let original = await fs.readFile(file);
		expect(src).to.equal(String(original).repeat(2));

	});

	it('uses a nested array of loaders', async function() {

		let one = {
			resolve: [(specifier) => {
				if (specifier.startsWith('@')) {
					let name = specifier.slice(1);
					let file = path.join(__dirname, 'files', name);
					let url = pathToFileURL(file).href;
					return { url };
				}
			}],
		};
		let two = {
			transform(source) {
				return { source: String(source).repeat(2) };
			},
		};

		this.create([one, [two]]);
		let src = await this.import('@source.js');
		let file = path.join(__dirname, 'files/source.js');
		let original = await fs.readFile(file);
		expect(src).to.equal(String(original).repeat(2));

	});

});
