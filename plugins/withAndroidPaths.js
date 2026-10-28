const { withAppBuildGradle } = require('expo/config-plugins');

// Hash long C++ object paths to support local Windows builds of RN codegen.
module.exports = (config) => withAppBuildGradle(config, (mod) => {
  if (!mod.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) {
    mod.modResults.contents = mod.modResults.contents.replace(/defaultConfig\s*\{/, `defaultConfig {
        externalNativeBuild {
            cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" }
        }`);
  }
  if (!mod.modResults.contents.includes('buildStagingDirectory')) {
    mod.modResults.contents = mod.modResults.contents.replace(/android\s*\{/, `android {
    externalNativeBuild {
        cmake { buildStagingDirectory file("../../.cxx") }
    }`);
  }
  return mod;
});
