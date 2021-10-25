// # extension-hooks.js
export default {
	resolve(specifier, opts) {
		let url = new URL(specifier, opts.parentURL);
		if (match(url, opts)) {
			return { url: String(url) };
		}
	},
	format(url, opts) {
		if (match(new URL(url), opts)) {
			return { format: 'module' };
		}
	},
};

function match(url, opts) {
	for (let ext of opts.extensions) {
		if (url.pathname.endsWith(ext)) return true;
	}
	return false;
}
