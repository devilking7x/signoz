import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Spin } from 'antd';
import { TelemetrytypesSourceDTO } from 'api/generated/services/sigNoz.schemas';
// ** Constants
import { DEBOUNCE_DELAY } from 'constants/queryBuilderFilterConfig';
import { useFieldKeysSuggestion } from 'hooks/querySuggestions/useFieldKeysSuggestion';
import useDebounce from 'hooks/useDebounce';
// ** Components
// ** Helpers
import { isEqual, uniqWith } from 'lodash-es';
import { BaseAutocompleteData } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { MetricAggregation } from 'types/api/v5/queryRange';
import { DATA_SOURCE_TO_SIGNAL, DataSource } from 'types/common/queryBuilder';
import { SelectOption } from 'types/common/select';
import { getFieldKeyLabel } from 'utils/fieldKeyContext';
import { useSelectPopupContainer } from 'utils/selectPopupContainer';

import { selectStyle } from '../config';
import { GroupByFilterProps } from './GroupByFilter.interfaces';
import { groupByFromLabel, groupByLabel } from './utils';

export const GroupByFilter = memo(function GroupByFilter({
	query,
	onChange,
	disabled,
	signalSource,
}: GroupByFilterProps): JSX.Element {
	const getPopupContainer = useSelectPopupContainer();
	const [searchText, setSearchText] = useState<string>('');
	const [localValues, setLocalValues] = useState<SelectOption<string, string>[]>(
		[],
	);
	const [isFocused, setIsFocused] = useState<boolean>(false);

	const debouncedValue = useDebounce(searchText, DEBOUNCE_DELAY);

	const metricName =
		query.dataSource === DataSource.METRICS
			? query.aggregateAttribute?.key ||
				(query.aggregations?.[0] as MetricAggregation)?.metricName
			: undefined;

	const { data: fieldKeys, isFetching } = useFieldKeysSuggestion(
		{
			signal: DATA_SOURCE_TO_SIGNAL[query.dataSource],
			source: signalSource === 'meter' ? TelemetrytypesSourceDTO.meter : undefined,
			metricName: metricName || undefined,
			searchText: debouncedValue,
		},
		query.builderQueryType,
		{ enabled: !disabled && isFocused },
	);

	const optionsData = useMemo(() => {
		const selectedKeys = new Set(query.groupBy.map(groupByLabel));
		const seen = new Set<string>();
		const options: SelectOption<string, string>[] = [];

		(fieldKeys ?? []).forEach((key) => {
			const label = getFieldKeyLabel(key.name, debouncedValue);
			if (selectedKeys.has(label) || seen.has(label)) {
				return;
			}
			seen.add(label);
			options.push({ label, value: label });
		});

		return options;
	}, [fieldKeys, debouncedValue, query.groupBy]);

	const handleSearchKeys = (searchText: string): void => {
		setSearchText(searchText);
	};

	const handleBlur = (): void => {
		setIsFocused(false);
		setSearchText('');
	};

	const handleFocus = (): void => {
		setIsFocused(true);
	};

	const handleChange = useCallback(
		(values: SelectOption<string, string>[]): void => {
			const groupByValues: BaseAutocompleteData[] = values.map((item) => {
				const existing = query.groupBy.find(
					(groupByItem) =>
						groupByItem.id === item.value || groupByLabel(groupByItem) === item.value,
				);

				return existing ?? groupByFromLabel(item.value);
			});

			onChange(uniqWith(groupByValues, isEqual));
		},
		[onChange, query.groupBy],
	);

	const clearSearch = useCallback(() => {
		setSearchText('');
	}, []);

	useEffect(() => {
		const currentValues: SelectOption<string, string>[] =
			query.groupBy?.map((item) => ({
				label: groupByLabel(item),
				value: `${item.id}`,
			})) || [];

		setLocalValues(currentValues);
	}, [query]);

	return (
		<Select
			getPopupContainer={getPopupContainer}
			mode="tags"
			style={selectStyle}
			onSearch={handleSearchKeys}
			showSearch
			disabled={disabled}
			filterOption={false}
			onBlur={handleBlur}
			onFocus={handleFocus}
			onDeselect={clearSearch}
			options={optionsData}
			value={localValues}
			labelInValue
			notFoundContent={isFetching ? <Spin size="small" /> : null}
			onChange={handleChange}
			data-testid="group-by"
			placeholder={localValues?.length === 0 ? 'Everything (no breakdown)' : ''}
		/>
	);
});
