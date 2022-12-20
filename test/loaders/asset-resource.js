import create from 'create-esm-loader';

export const { resolve, getFormat, getSource, transformSource, load } = await create({
	loaders: [
		{
			test: /\.(png|jpe?g)$/,
			type: 'asset/resource',
		},
	],
});
