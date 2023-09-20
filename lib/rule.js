import { createRequire } from 'module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// # isRule(config)
// For now we consider the configuration a webpack rule if it has a `test` 
// property.
export function isRule(config) {
	return !!config.test;
}

// # generateRule(config)
// See #6. This function accepts a configuration that looks like a webpack rule 
// and returns the corresponding hooks for it. Should make it easier to use 
// existing webpack loaders.
export function generateRule(config) {

	// Create the matcher and transform functions based on the configuration.
	const match = makeMatcher(config.test);
	const transformer = makeTransformer(config);

	// Now compose our hooks.
	return {
		async resolve(specifier, opts) {
			if (!match(specifier)) return;
			let url = await resolveSpecifier(specifier, opts);
			return {
				url,
				format: 'module',
			};
		},

		// For compatibility with Node <16.12 we have to provide a format hook 
		// as well. We only support modules though. We're doing esm anyway.
		format(specifier, opts) {
			let url = new URL(specifier);
			if (!match(url.href)) return;
			return {
				format: 'module',
			};
		},
		async transform(source, opts) {
			let url = new URL(opts.url);
			if (!match(url.href)) return;
			return await transformer(source, { url });
		},
	};

}

// # resolveSpecifier(specifier, opts)
// Resolves the given specifier to a file. We use enhanced resolve here based 
// on the directory of the *parent module* so that we can properly support the 
// exports field. It doesn't work if we use `require.resolve()` because then it 
// doesn't support the exports as we're running in a different module!
function resolveSpecifier(specifier, opts) {
	let parent = opts.parentURL;
	if (!parent) {
		parent = pathToFileURL(process.cwd());
	}

	// IMPORTANT! We can't use `import.meta.resolve` here as that would result 
	// in infinite loops! If we don't want to rely on require.resolve anymore, 
	// we can also use the `enhanced-resolve` module from npm which has the 
	// same functionality!
	const require = createRequire(parent);
	let file = require.resolve(specifier);
	return pathToFileURL(file).href;

}

// # makeMatcher(test)
// Creates the function to be used to match a url based on the test.
function makeMatcher(test) {

	// If a function was specified, return as is.
	let type = typeof test;
	if (type === 'function') return test;

	// Regular expressions are the most common way obviously.
	if (test instanceof RegExp) {
		let regex = test;
		return function(url) {
			return regex.test(url);
		};
	}

}

// # makeTransformer(config)
// Creates the transform function, but in the format String -> String
function makeTransformer(config) {

	// Check first if we're dealing with assets. Note: if `/asset` is 
	// specified, we will always simply use the url. Doesn't really matter as 
	// we're on Node. You mainly use it for testing anyway and then this is the 
	// fastest.
	let { type } = config;
	if (type === 'asset/source') {
		return source => `export default ${JSON.stringify(String(source))}`;
	} else if (type === 'asset/inline') {
		return (source, { url }) => {
			let base64 = source.toString('base64');
			let mimetype = getMediaType(url);
			let text = `data:${mimetype};base64,${base64}`;
			return `export default ${JSON.stringify(text)}`;
		};
	} else if (type === 'asset/resource' || type === 'asset') {
		return source => {
			return `export default import.meta.url;`;
		};
	} else if (type === 'mock') {
		return () => `export default {};`;
	} else if (type === 'json') {
		return source => {
			let obj = JSON.parse(String(source));
			return `export default ${JSON.stringify(obj)};`;
		};
	}

	// If we reach this point, we're not dealing with asset modules and hence 
	// we have to build up the transformer function ourselves.
	return buildLoaderChain(config.use || config.loader);

}

// # buildLoaderChain(loaders)
// Builds up the transformer chain. Just like with webpack, loaders are 
// evaluated in *backwards order*.
function buildLoaderChain(loaders) {
	let arr = Array.isArray(loaders)  ? [...loaders] : [loaders];
	return async function transform(source, { url }) {
		let output = String(source);
		for (let i = arr.length-1; i >= 0; i--) {
			let { loader, options } = normalize(arr[i]);
			if (typeof loader === 'string') {

				// See #6. In order to allow esm loaders to be more versatile, 
				// we'll first check for a `transform` in the exports. If this 
				// exists, we assume it to be the *raw source transform* as if 
				// it were a webpack loader. If it doesn't exist, we assume 
				// that the default export is the *raw source transform*.
				let module = await import(loader);
				if (typeof module.default === 'function') {
					loader = module.default;
				} else if (typeof module.transform === 'function') {
					loader = module.transform;
				} else {
					throw new Error([
						`Unable to find a source transform in ${loader}!`,
						'Either the default export must be a function, or a function named transform() must be exported!',
					].join('\n'));
				}

			}

			// Create a loader context just like webpack would do so that we 
			// can have compatibility with existing webpack loaders.
			let ctx = new LoaderContext({
				options,
				loaderIndex: i,
				url,
			});
			let result = loader.call(ctx, output);

			// Webpack loaders can have several ways of returning. We'll detect 
			// them all now.
			if (result && result.then && result.catch) {
				output = await result;
			} else if (ctx.promise) {
				let { content } = await ctx.promise;
				output = content;
			} else {
				output = result;
			}

		}
		return output;
	};
}

// # normalize(def)
function normalize(def) {
	if (typeof def === 'string' || typeof def === 'function') {
		return {
			loader: def,
			options: {},
		};
	}
	return {
		options: {},
		...def,
	};
}

// # getMediaType(url)
// Returns the media type for an inline asset for the given url.
function getMediaType(url) {
	let ext = path.extname(url.href).slice(1);
	return {
		png: 'image/png',
		pdf: 'application/pdf',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		tif: 'image/tiff',
		tiff: 'image/tiff',
		txt: 'text/plain',
		csv: 'text/csv',
		htm: 'text/html',
		html: 'text/html',
		ico: 'image/vnd.microsoft.icon',
		json: 'application/json',
		otf: 'font/otf',
	}[ext] || 'application/octet-stream';
}

// # LoaderContext
// The LoaderContext is meant to mock the webpack loader context so that we can 
// - hopefully - provide some degree of compatibility with existing webpack 
// loaders. See https://webpack.js.org/api/loaders/ for more info.
class LoaderContext {

	// ## constructor(def)
	constructor(def = {}) {
		this.promise = null;
		this.options = def.options;
		this.context = '';
		this.data = {};
		this.fs = fs;
		this.hot = false;
		this.loaderIndex = def.loaderIndex;
		this.mode = 'none';
		this.query = def.options;
		this.request = '';
		this.rootContext = '';
		this.sourceMap = false;
		this.target = 'node';
		this.version = 2;
		this.webpack = false;

		// Parse the url for some more information. Note: loaders are running 
		// in a separate thread now, which causes Node to report that we can't 
		// pass a URL to fileURLPath because it's a url from a different 
		// thread, so def.url instanceof URL is failing - at least that's what 
		// we guess. It can be solved easily though by ensuring that we pass a 
		// string to fileURLToPath. Unable to reprocude reliably though, so no 
		// tests for it unfortunately. ¯\_(ツ)_/¯
		let url = new URL(def.url);
		this.resourcePath = fileURLToPath(url.href);
		this.resource = this.resourcePath + url.search;
		this.resourceQuery = url.search;

		// TypeScript relies on module being present apparently, even though 
		// it's deprecated.
		this._module = new Module();
		this._compiler = {
			hooks: {},
			options: {
				plugins: [],
			},
		};
		for (let hook of ['watchRun', 'compilation']) {
			this._compiler.hooks[hook] = new Hook();
		}

		this._compilation = {
			hooks: {},
		};
		for (let hook of ['processAssets']) {
			this._compilation.hooks[hook] = new Hook();
		}

	}

	// ## async()
	async() {
		let callback;
		this.promise = new Promise((resolve, reject) => {
			callback = (err, content, sourceMap, meta) => {
				if (err) {
					return reject(err);
				}
				return resolve({ content, sourceMap, meta });
			};
		});
		return callback;
	}

	// ## callback()
	// Alias for `.async()`.
	callback() {
		return this.async();
	}

	// ## getOptions()
	getOptions() {
		return this.options;
	}

	// Some methods simply need to be mocked and don't actually need to do 
	// anything.
	addContextDependency() {}
	addDependency() {}
	addMissingDependency() {}
	cacheable() {}
	clearDependencies() {}
	emitError() {}
	emitFile() {}
	emitWarning() {}
	getResolve() {
		return {};
	}
	importModule() {}
	resolve() {}

}

// # Module
// Mock for the _module property in webpack.
class Module {
	constructor() {
		this.buildMeta = {};
	}
	addError() {}
}

class Hook {
	tap() {}
	tapAsync() {}
}
