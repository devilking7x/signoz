import React from 'react';
import { fireEvent } from '@testing-library/react';
import { ENVIRONMENT } from 'constants/env';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import { IBuilderQuery } from '../../../../../types/api/queryBuilder/queryBuilderData';
import { DataSource } from '../../../../../types/common/queryBuilder';
import { GroupByFilter } from '../GroupByFilter';

const fieldKeysURL = `${ENVIRONMENT.baseURL}/api/v1/fields/keys`;

type FieldKeyVariant = {
	name: string;
	fieldContext: string;
	fieldDataType?: string;
};

const fieldKeysBody = (
	variants: FieldKeyVariant[],
): Record<string, unknown> => ({
	status: 'success',
	data: {
		complete: true,
		keys: variants.reduce<Record<string, FieldKeyVariant[]>>(
			(acc, variant) => ({
				...acc,
				[variant.name]: [...(acc[variant.name] ?? []), variant],
			}),
			{},
		),
	},
});

function setup(
	overrides?: Partial<React.ComponentProps<typeof GroupByFilter>>,
): { onChange: jest.Mock } {
	const onChange = jest.fn();
	const query = {
		dataSource: DataSource.METRICS,
		aggregateAttribute: { key: 'signoz_calls_total' },
		aggregateOperator: 'COUNT',
		groupBy: [],
	} as unknown as IBuilderQuery;
	render(
		<GroupByFilter
			query={query}
			onChange={onChange}
			disabled={false}
			{...overrides}
		/>,
	);
	return { onChange };
}

async function clickOption(label: string): Promise<void> {
	const user = userEvent.setup({ pointerEventsCheck: 0 });
	await screen.findByRole('listbox');
	const option = await screen.findByText(
		(content, el) =>
			content.trim() === label && !!el?.closest('.ant-select-item-option'),
	);
	await user.click(option);
}

describe('GroupByFilter', () => {
	const requests: URLSearchParams[] = [];

	beforeAll(() => {
		server.listen();
	});
	afterEach(() => {
		server.resetHandlers();
		requests.length = 0;
		jest.clearAllMocks();
	});
	afterAll(() => {
		server.close();
	});

	function useFieldKeys(variants: FieldKeyVariant[]): void {
		server.use(
			rest.get(fieldKeysURL, (req, res, ctx) => {
				requests.push(req.url.searchParams);
				return res(ctx.status(200), ctx.json(fieldKeysBody(variants)));
			}),
		);
	}

	it('asks the fields API for meter keys and emits a typed custom key', async () => {
		useFieldKeys([]);
		const { onChange } = setup({ signalSource: 'meter' });

		const select = screen.getByTestId('group-by');
		fireEvent.focus(select);

		await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(1));
		expect(requests[0].get('signal')).toBe('metrics');
		expect(requests[0].get('source')).toBe('meter');
		expect(requests[0].get('metricName')).toBe('signoz_calls_total');

		const input = select.querySelector('input') as HTMLInputElement;
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.type(input, 'custom.attr');
		await screen.findByRole('listbox');
		const option = await screen.findByRole('option', { name: 'custom.attr' });
		await user.click(option);

		expect(onChange).toHaveBeenCalled();
		const emitted = onChange.mock.calls[0][0][0];
		expect(emitted.key).toBe('custom.attr');
		expect(emitted.id).toBe('custom.attr----');
	});

	it('emits the picked suggestion by name only', async () => {
		useFieldKeys([
			{ name: 'service.name', fieldContext: 'resource', fieldDataType: 'string' },
		]);
		const { onChange } = setup();

		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.click(screen.getByRole('combobox'));
		await clickOption('service.name');

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange.mock.calls[0][0][0]).toMatchObject({
			key: 'service.name',
			id: 'service.name----',
			type: '',
			dataType: '',
		});
	});

	it('shows one option per name when the API returns several contexts', async () => {
		useFieldKeys([
			{ name: 'service.name', fieldContext: 'resource' },
			{ name: 'service.name', fieldContext: 'attribute' },
			{ name: 'host.name', fieldContext: 'resource' },
		]);
		setup();

		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.click(screen.getByRole('combobox'));
		await screen.findByRole('listbox');

		await waitFor(() =>
			expect(
				screen
					.getAllByText('service.name')
					.filter((el) => !!el.closest('.ant-select-item-option')),
			).toHaveLength(1),
		);
	});

	it('stores a typed context prefix as the key type, not in the name', async () => {
		useFieldKeys([{ name: 'service.name', fieldContext: 'attribute' }]);
		const { onChange } = setup();

		const select = screen.getByTestId('group-by');
		const input = select.querySelector('input') as HTMLInputElement;
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.type(input, 'attribute.serv');

		await waitFor(() =>
			expect(
				requests.some((params) => params.get('searchText') === 'attribute.serv'),
			).toBe(true),
		);
		await clickOption('attribute.service.name');

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange.mock.calls[0][0][0]).toMatchObject({
			key: 'service.name',
			type: 'attribute',
			dataType: '',
			id: 'service.name----attribute',
		});
	});

	it('shows a stored context-typed key with its prefix', () => {
		setup({
			query: {
				dataSource: DataSource.LOGS,
				groupBy: [
					{
						key: 'service.name',
						type: 'resource',
						dataType: '',
						id: 'service.name----resource',
					},
					{ key: 'host.name', type: 'tag', dataType: '', id: 'host.name----tag' },
				],
			} as unknown as IBuilderQuery,
		});

		expect(screen.getByText('resource.service.name')).toBeInTheDocument();
		expect(screen.getByText('host.name')).toBeInTheDocument();
	});
});
