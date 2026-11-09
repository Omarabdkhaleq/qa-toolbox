import { exposeWorker } from '../../core/worker/expose';
import { applyEdit, type EditAction } from './logic';

exposeWorker(({ text, action }: { text: string; action: EditAction }) => applyEdit(text, action));
