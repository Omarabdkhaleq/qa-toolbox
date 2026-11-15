import {
  jmespathQueryLanguage,
  jsonpathQueryLanguage,
  jsonQueryLanguage,
  type QueryLanguage,
} from 'vanilla-jsoneditor';

/** Only languages that run without eval/new Function, so the strict CSP holds (intent.md §6.3). */
export const QUERY_LANGUAGES: QueryLanguage[] = [
  jsonQueryLanguage,
  jmespathQueryLanguage,
  jsonpathQueryLanguage,
];
