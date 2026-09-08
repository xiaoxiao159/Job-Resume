/** Basic Info 单例（04 §5.2）· polish-self-eval（AI 优化自我评价，202） */
import { apiGet, apiSend, withMock } from './client';
import { mockGetBasicInfo, mockPolishSelfEval, mockPutBasicInfo } from './mock/handlers';
import type { BasicInfo, PollTask } from './types';

export const basicInfoKeys = {
  all: ['basic-info'] as const,
};

export const getBasicInfo = withMock(mockGetBasicInfo, () => apiGet<BasicInfo | null>('/basic-info'));

export const putBasicInfo = withMock(mockPutBasicInfo, (body: BasicInfo) =>
  apiSend<BasicInfo>('PUT', '/basic-info', body),
);

/** 04 §5.2 决策 #2：独立端点；产物为回填建议（done.result.self_evaluation） */
export const polishSelfEval = withMock(mockPolishSelfEval, () =>
  apiSend<PollTask>('POST', '/basic-info/polish-self-eval', {}),
);