import { ENVIRONMENT } from 'constants/env';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import { OrderByFilter } from '../OrderByFilter';

const fieldKeysURL = `${ENVIRONMENT.baseURL}/api/v1/fields/keys`;

const fieldKeysBody = (names: string[]): Record<string, unknown> => ({
	status: 'success',
	data: {
		complete: true,
		keys: Object.fromEntries(
			names.map((name) => [name, [{ name, fieldContext: 'resource' }]]),
		),
	},
});

function setup(query: Partial<IBuilderQuery>): { onChange: jest.Mock } {
	const onChange = jest.fn();
	render(
		<OrderByFilter
			query={
				{
					dataSource: DataSource.LOGS,
					aggregateOperator: 'noop',
					aggregateAttribute: { key: '' },
					groupBy: [],
					orderBy: [],
					aggregations: [{ expression: 'count()' }],
					...query,
				} as unknown as IBuilderQuery
			}
			onChange={onChange}
			isNewQueryV2
		/>,
	);
	return { onChange };
}

describe('OrderByFilter', () => {
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

	function useFieldKeys(names: string[]): void {
		server.use(
			rest.get(fieldKeysURL, (req, res, ctx) => {
				requests.push(req.url.searchParams);
				return res(ctx.status(200), ctx.json(fieldKeysBody(names)));
			}),
		);
	}

	it('offers fields API keys in both directions for a noop query', async () => {
		useFieldKeys(['service.name']);
		const { onChange } = setup({});

		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.click(screen.getByRole('combobox'));

		await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(1));
		expect(requests[0].get('signal')).toBe('logs');

		await screen.findByRole('listbox');
		await screen.findByText('service.name desc');
		await user.click(await screen.findByText('service.name asc'));

		expect(onChange).toHaveBeenCalledWith([
			{ columnName: 'service.name', order: 'asc' },
		]);
	});

	it('keeps the typed context prefix on the offered key', async () => {
		useFieldKeys(['service.name']);
		setup({});

		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.type(screen.getByRole('combobox'), 'resource.serv');

		await waitFor(() =>
			expect(
				requests.some((params) => params.get('searchText') === 'resource.serv'),
			).toBe(true),
		);
		await screen.findByText('resource.service.name asc');
	});

	it('does not call the fields API for an aggregated query', async () => {
		useFieldKeys(['service.name']);
		setup({
			aggregateOperator: 'count',
			groupBy: [
				{
					key: 'host.name',
					id: 'host.name----',
					type: '',
					dataType: DataTypes.EMPTY,
				},
			],
		});

		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await user.click(screen.getByRole('combobox'));

		await screen.findByText('host.name asc');
		expect(requests).toHaveLength(0);
	});
});
