import create from 'create-esm-loader';
import hooks from './extension-hooks.js';

export const { resolve, getFormat, getSource, transformSource, load } = await create([
	{
		hooks,
		options: {
			extensions: ['.txt'],
		},
	},
	{
		transform(source, opts) {
			let url = new URL(opts.url);
			if (url.pathname.endsWith('.txt')) {
				return String(source).repeat(2);
			}
		},
	},
	{
		transform(source, opts) {
			let url = new URL(opts.url);
			if (url.pathname.endsWith('.txt')) {
				return `export default ${JSON.stringify(source)}`;
			}
		},
	},
]);
