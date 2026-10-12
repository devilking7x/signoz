import {
	baseAutoCompleteIdKeysOrder,
	initialAutocompleteData,
} from 'constants/queryBuilder';
import { createIdFromObjectFields } from 'lib/createIdFromObjectFields';
import { BaseAutocompleteData } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { FIELD_CONTEXTS, getFieldContextPrefix } from 'utils/fieldKeyContext';

// query_range labels series by the bare key and the legend / table code reads the stored
// key by that name, so a typed context goes in `type` (sent as fieldContext), never in `key`.
export const groupByLabel = (item: BaseAutocompleteData): string =>
	item.type && FIELD_CONTEXTS.includes(item.type)
		? `${item.type}.${item.key}`
		: item.key;

export const groupByFromLabel = (label: string): BaseAutocompleteData => {
	const prefix = getFieldContextPrefix(label);
	const fields = {
		key: prefix ? prefix.remainder : label,
		dataType: initialAutocompleteData.dataType,
		type: prefix?.context ?? '',
	};

	return {
		...initialAutocompleteData,
		...fields,
		id: createIdFromObjectFields(fields, baseAutoCompleteIdKeysOrder),
	};
};
