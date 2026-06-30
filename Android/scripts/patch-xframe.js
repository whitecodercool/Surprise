const fs = require('fs');
const path = require('path');

const srcXframe = path.join(__dirname, '../patches/Xframe.java');
const dstXframe = path.join(__dirname, '../node_modules/capacitor-plugin-xframe/android/src/main/java/com/visnalize/capacitor/plugins/xframe/Xframe.java');

const srcPlugin = path.join(__dirname, '../patches/XframePlugin.java');
const dstPlugin = path.join(__dirname, '../node_modules/capacitor-plugin-xframe/android/src/main/java/com/visnalize/capacitor/plugins/xframe/XframePlugin.java');

try {
  if (fs.existsSync(srcXframe) && fs.existsSync(path.dirname(dstXframe))) {
    fs.copyFileSync(srcXframe, dstXframe);
    console.log('Successfully patched Xframe.java');
  } else {
    console.warn('Xframe patch source or destination path does not exist');
  }

  if (fs.existsSync(srcPlugin) && fs.existsSync(path.dirname(dstPlugin))) {
    fs.copyFileSync(srcPlugin, dstPlugin);
    console.log('Successfully patched XframePlugin.java');
  } else {
    console.warn('XframePlugin patch source or destination path does not exist');
  }
} catch (err) {
  console.error('Failed to apply Xframe patches:', err);
}
