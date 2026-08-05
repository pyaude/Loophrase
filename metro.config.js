const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 支持 expo-sqlite web 端的 WASM 文件解析
config.resolver.assetExts.push('wasm');

module.exports = config;
