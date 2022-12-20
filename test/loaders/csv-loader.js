import create from 'create-esm-loader';

export const { resolve, getFormat, getSource, transformSource, load } = await create({
	loaders: [
		{
			test(url) {
				return url.endsWith('.csv');
			},
			use: [
				str => {
					let table = str.trim().split('\n').map(x => {
						return x.trim().split('\t');
					});
					return `export default ${JSON.stringify(table)};`;
				},
				String(new URL('./comma-to-tab.js', import.meta.url)),
			],
		},
	],
});
