#!/usr/bin/env bash
# Copy logo (white background) into native iOS/Android splash + iOS app icon.
# Run after `expo prebuild` if the simulator still shows an old splash/icon.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sync_ios() {
  local pkg="$1"
  local src="$ROOT/packages/$pkg/assets/images/splash-icon-white-bg.png"
  if [[ ! -f "$src" ]]; then
    echo "Missing $src — run: pnpm assets:logo-white-bg" >&2
    exit 1
  fi
  local name
  name=$(basename "$pkg")
  local app
  if [[ "$pkg" == *customer* ]]; then app="SevaCustomer"; else app="SevaWorker"; fi
  local splash="$ROOT/packages/$pkg/ios/$app/Images.xcassets/SplashScreenLogo.imageset"
  local icon="$ROOT/packages/$pkg/ios/$app/Images.xcassets/AppIcon.appiconset"
  if [[ -d "$splash" ]]; then
    cp "$src" "$splash/image.png"
    cp "$src" "$splash/image@2x.png"
    cp "$src" "$splash/image@3x.png"
    echo "OK iOS splash: $pkg"
  fi
  if [[ -f "$icon/App-Icon-1024x1024@1x.png" ]]; then
    cp "$src" "$icon/App-Icon-1024x1024@1x.png"
    echo "OK iOS icon: $pkg"
  fi
}

sync_android_splash() {
  local pkg="$1"
  local src="$ROOT/packages/$pkg/assets/images/splash-icon-white-bg.png"
  local base="$ROOT/packages/$pkg/android/app/src/main/res"
  [[ -d "$base" ]] || return 0
  sips -z 288 288 "$src" --out "$base/drawable-mdpi/splashscreen_logo.png" >/dev/null
  sips -z 432 432 "$src" --out "$base/drawable-hdpi/splashscreen_logo.png" >/dev/null
  sips -z 576 576 "$src" --out "$base/drawable-xhdpi/splashscreen_logo.png" >/dev/null
  sips -z 864 864 "$src" --out "$base/drawable-xxhdpi/splashscreen_logo.png" >/dev/null
  sips -z 1152 1152 "$src" --out "$base/drawable-xxxhdpi/splashscreen_logo.png" >/dev/null
  echo "OK Android splash drawables: $pkg"
}

sync_ios customer-app
sync_ios worker-app
sync_android_splash customer-app
sync_android_splash worker-app
echo "Done."
