import create from 'create-esm-loader';

export const { resolve, getFormat, getSource, transformSource, load } = await create({
	loaders: [
		{
			test(url) {
				return url.endsWith('.csv');
			},
			use: [
				{
					async loader(str, ctx) {
						let { delimiter = ',' } = ctx.options;
						let table = str.trim().split('\n').map(x => {
							return x.trim().split(delimiter);
						});
						return `export default ${JSON.stringify(table)};`;
					},
					options: {
						delimiter: '\t',
					},
				},
				String(new URL('./comma-to-tab.js', import.meta.url)),
			],
		},
	],
});
