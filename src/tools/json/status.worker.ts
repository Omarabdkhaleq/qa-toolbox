import { exposeWorker } from '../../core/worker/expose';
import { computeStatus } from './logic';

exposeWorker(computeStatus);
