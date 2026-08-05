// Mock: expo-audio

export const requestRecordingPermissionsAsync = jest.fn();
export const setAudioModeAsync = jest.fn();
export const useAudioRecorder = jest.fn();
export const useAudioRecorderState = jest.fn(() => ({
  canRecord: false,
  isRecording: false,
  durationMillis: 0,
  mediaServicesDidReset: false,
  metering: -160,
  url: null,
}));

export const RecordingPresets = {
  HIGH_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { extension: '.m4a', outputFormat: 'aac ', audioQuality: 96 },
    web: { mimeType: 'audio/m4a', bitsPerSecond: 128000 },
  },
  LOW_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
    android: { extension: '.3gp', outputFormat: '3gp', audioEncoder: 'amr_wb' },
    ios: { extension: '.m4a', outputFormat: 'aac ', audioQuality: 32 },
    web: { mimeType: 'audio/m4a', bitsPerSecond: 64000 },
  },
};

export type AudioRecorder = any;
export type RecordingStatus = any;
