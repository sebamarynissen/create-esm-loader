import create from 'create-esm-loader';

export const { resolve, getFormat, getSource, transformSource, load } = await create({
	test: /\.(png)$/,
	type: 'mock',
});
