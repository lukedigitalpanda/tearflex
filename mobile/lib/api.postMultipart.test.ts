jest.mock('./secureTokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access: 'tok', refresh: 'r' }),
  setTokens: jest.fn(), clearTokens: jest.fn(),
}))
import { api } from './api'

describe('api.postMultipart fileField', () => {
  let appendSpy: jest.SpyInstance
  beforeEach(() => {
    appendSpy = jest.spyOn(FormData.prototype, 'append')
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore test stub
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) })
  })
  afterEach(() => { appendSpy.mockRestore(); jest.restoreAllMocks() })

  it('defaults the file field to video_file', async () => {
    await api.postMultipart('assessments/captures/', { assessment: '3' }, { uri: 'file://v.mp4', name: 'v.mp4', type: 'video/mp4' })
    expect(appendSpy).toHaveBeenCalledWith('video_file', expect.anything())
  })

  it('uses the given file field name (image for stills)', async () => {
    await api.postMultipart('assessments/captures/9/stills/', { timestamp_seconds: '8.2' }, { uri: 'file://s.jpg', name: 's.jpg', type: 'image/jpeg' }, 'image')
    expect(appendSpy).toHaveBeenCalledWith('image', expect.anything())
    expect(appendSpy).toHaveBeenCalledWith('timestamp_seconds', '8.2')
  })
})
