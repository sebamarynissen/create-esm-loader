import path from 'node:path';

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
		resolve(specifier, opts) {
			let url = new URL(specifier, opts.parentURL);
			if (!match(url)) return;
			return {
				url: String(url),
				format: 'module',
			};
		},
		transform(source, opts) {
			let url = new URL(opts.url);
			if (!match(url)) return;
			return transformer(source, { url });
		},
	};

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
			return regex.test(url.href);
		}
	}

}

// # makeTransformer(config)
// Creates the transform function, but in the format String -> String
function makeTransformer(config) {

	// Check first if we're dealing with assets.
	let { type = '' } = config;
	if (type === 'asset/source') {
		return source => `export default ${JSON.stringify(String(source))}`;
	} else if (type === 'asset/inline') {
		return (source, { url }) => {
			let base64 = source.toString('base64');
			let mimetype = getMediaType(url);
			let text = `data:${mimetype};base64,${base64}`;
			return `export default ${JSON.stringify(text)}`;
		};
	} else if (type === 'asset/resource') {
		return source => {
			return `export default import.meta.url;`;
		};
	}

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
