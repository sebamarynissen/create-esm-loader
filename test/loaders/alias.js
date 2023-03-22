import create from 'create-esm-loader';

export const { resolve, load } = await create({
	resolve(specifier, opts) {
		let url = new URL(specifier, opts.parentURL);
		if (!url.pathname.endsWith('.txt')) return;
		return {
			url: String(url),
			format: 'module',
		};
	},
	transform(source, opts) {
		let url = new URL(opts.url);
		if (!url.pathname.endsWith('.txt')) return;
		return `export default ${JSON.stringify(String(source))}`;
	},
});
