#!/usr/bin/env bash
set -e

echo "===================================================="
echo " 1. Building StylePool MTL Web Bundle (Vite)        "
echo "===================================================="
npm run build

echo "===================================================="
echo " 2. Adding & Syncing Capacitor iOS and Android      "
echo "===================================================="
if [ ! -d "android" ]; then
  npx cap add android
fi

if [ ! -d "ios" ]; then
  npx cap add ios
fi

npx cap sync

DESKTOP_DIR="$HOME/Desktop/StylePool-MTL-Apps"
mkdir -p "$DESKTOP_DIR"

echo "===================================================="
echo " 3. Building Android APK -> Desktop                 "
echo "===================================================="
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Ensure AndroidX is enabled in gradle.properties
if ! grep -q "android.useAndroidX=true" android/gradle.properties 2>/dev/null; then
  echo "android.useAndroidX=true" >> android/gradle.properties
  echo "android.enableJetifier=true" >> android/gradle.properties
fi

# Auto-select Java 21 or Java 17 if installed on macOS
if /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
  export JAVA_HOME=$(/usr/libexec/java_home -v 21)
elif /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
fi

if [ -d "$ANDROID_HOME" ]; then
  echo "sdk.dir=$ANDROID_HOME" > android/local.properties
  (
    cd android
    chmod +x gradlew
    ./gradlew assembleDebug
  )
  cp android/app/build/outputs/apk/debug/app-debug.apk "$DESKTOP_DIR/StylePool-MTL-Android.apk"
  cp android/app/build/outputs/apk/debug/app-debug.apk "$HOME/Desktop/StylePool-MTL-Android.apk"
  echo "✅ Android APK saved to: ~/Desktop/StylePool-MTL-Android.apk"
else
  echo "⚠️ Android SDK not found at $ANDROID_HOME. Open Android Studio once to install the SDK."
fi

echo "===================================================="
echo " 4. Building iOS App (.app) -> Desktop              "
echo "===================================================="
if command -v xcodebuild >/dev/null 2>&1; then
  if [ -d "ios/App/App.xcworkspace" ]; then
    xcodebuild \
      -workspace ios/App/App.xcworkspace \
      -scheme App \
      -configuration Debug \
      -sdk iphonesimulator \
      -derivedDataPath ios/build \
      CODE_SIGNING_ALLOWED=NO \
      quiet
  else
    xcodebuild \
      -project ios/App/App.xcodeproj \
      -scheme App \
      -configuration Debug \
      -sdk iphonesimulator \
      -derivedDataPath ios/build \
      CODE_SIGNING_ALLOWED=NO \
      quiet
  fi

  rm -rf "$DESKTOP_DIR/StylePool-MTL-iOS.app" "$HOME/Desktop/StylePool-MTL-iOS.app"
  cp -R ios/build/Build/Products/Debug-iphonesimulator/App.app "$DESKTOP_DIR/StylePool-MTL-iOS.app"
  cp -R ios/build/Build/Products/Debug-iphonesimulator/App.app "$HOME/Desktop/StylePool-MTL-iOS.app"
  echo "✅ iOS App bundle saved to: ~/Desktop/StylePool-MTL-iOS.app"
else
  echo "⚠️ Xcode command line tools not found. Install Xcode to build the iOS app."
fi

echo "===================================================="
echo " 5. Creating Desktop One-Click App Launcher         "
echo "===================================================="
cat << 'LAUNCHER' > "$HOME/Desktop/Launch-StylePool-Apps.command"
#!/usr/bin/env bash
echo "Launching StylePool MTL on iOS Simulator..."
open -a Simulator
xcrun simctl bootstatus booted -b >/dev/null 2>&1 || true
if [ -d "$HOME/Desktop/StylePool-MTL-iOS.app" ]; then
  xcrun simctl install booted "$HOME/Desktop/StylePool-MTL-iOS.app"
  xcrun simctl launch booted com.stylepoolmtl.app
fi

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -x "$ANDROID_HOME/platform-tools/adb" ] && [ -f "$HOME/Desktop/StylePool-MTL-Android.apk" ]; then
  if "$ANDROID_HOME/platform-tools/adb" devices | grep -q "device$"; then
    echo "Installing & launching StylePool MTL on connected Android device/emulator..."
    "$ANDROID_HOME/platform-tools/adb" install -r "$HOME/Desktop/StylePool-MTL-Android.apk"
    "$ANDROID_HOME/platform-tools/adb" shell monkey -p com.stylepoolmtl.app -c android.intent.category.LAUNCHER 1
  fi
fi
LAUNCHER

chmod +x "$HOME/Desktop/Launch-StylePool-Apps.command"

echo "===================================================="
echo " 🎉 ALL DONE! Check your Mac Desktop:               "
echo "   1. ~/Desktop/StylePool-MTL-Android.apk           "
echo "   2. ~/Desktop/StylePool-MTL-iOS.app               "
echo "   3. ~/Desktop/Launch-StylePool-Apps.command       "
echo "===================================================="
