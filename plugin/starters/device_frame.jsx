// DeviceFrame — parametric device bezel
// Usage:
//   <DeviceFrame kind="ios">       // iPhone 15 Pro (390×844), Dynamic Island
//   <DeviceFrame kind="android">   // Pixel 8 (412×915), punch-hole
//   <DeviceFrame kind="mac">       // macOS window (1440×900), traffic lights
//   <DeviceFrame kind="browser">   // Chromium browser (1440×900), tab bar + url bar
//
// Props:
//   kind: 'ios' | 'android' | 'mac' | 'browser'  (default: 'ios')
//   keyboard: boolean  (ios/android only, default false)
//   statusBar: boolean  (ios/android only, default true)
//   time: string  (status bar clock, default '9:41')
//   url: string  (browser only)
//   title: string  (mac/browser title)
//
// Exports to window: DeviceFrame

(() => {
  const SIZES = {
    ios: { w: 390, h: 844, radius: 55 },
    android: { w: 412, h: 915, radius: 44 },
    mac: { w: 1440, h: 900, radius: 12 },
    browser: { w: 1440, h: 900, radius: 12 },
  };

  const frameStyles = {
    shell: (kind) => ({
      position: 'relative',
      width: SIZES[kind].w,
      height: SIZES[kind].h,
      borderRadius: SIZES[kind].radius,
      background: kind === 'ios' || kind === 'android'
        ? 'linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%)'
        : '#1a1a1a',
      padding: kind === 'ios' || kind === 'android' ? 10 : 0,
      boxSizing: 'border-box',
      boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.08) inset',
      overflow: 'hidden',
      fontFamily: '-apple-system, system-ui, sans-serif',
    }),
    screen: (kind) => ({
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: kind === 'ios' ? 45 : kind === 'android' ? 34 : kind === 'mac' ? 12 : 12,
      background: '#ffffff',
      overflow: 'hidden',
    }),
    statusBar: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 47,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 30px 0 36px',
      fontSize: 16, fontWeight: 600, color: '#000',
      zIndex: 10,
    },
    dynamicIsland: {
      position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
      width: 120, height: 34, borderRadius: 20, background: '#000',
      zIndex: 20,
    },
    punchHole: {
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      width: 14, height: 14, borderRadius: 7, background: '#000',
      zIndex: 20,
    },
    homeIndicator: {
      position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
      width: 140, height: 5, borderRadius: 3, background: '#000',
      zIndex: 10,
    },
    gestureBar: {
      position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
      width: 120, height: 4, borderRadius: 2, background: '#000',
      zIndex: 10,
    },
    keyboard: {
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 291,
      background: '#d1d4dc', zIndex: 5,
    },
    macTitleBar: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 28,
      background: 'linear-gradient(180deg, #ebebeb 0%, #dedede 100%)',
      borderBottom: '1px solid #c0c0c0',
      borderTopLeftRadius: 12, borderTopRightRadius: 12,
      display: 'flex', alignItems: 'center', padding: '0 12px',
      zIndex: 10,
    },
    trafficLights: {
      display: 'flex', gap: 8, alignItems: 'center',
    },
    tl: (color) => ({ width: 12, height: 12, borderRadius: 6, background: color, border: '0.5px solid rgba(0,0,0,0.1)' }),
    macTitle: {
      position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 13, color: '#333', pointerEvents: 'none',
    },
    browserTabs: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 38,
      background: '#dee1e6', display: 'flex', alignItems: 'flex-end',
      paddingLeft: 80, paddingRight: 12, gap: 2, zIndex: 10,
    },
    tab: (active) => ({
      height: 32, padding: '0 16px',
      background: active ? '#ffffff' : 'transparent',
      borderRadius: '8px 8px 0 0',
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, color: '#3c4043', maxWidth: 240,
    }),
    trafficLightsBrowser: {
      position: 'absolute', top: 12, left: 12,
      display: 'flex', gap: 8,
    },
    urlBar: {
      position: 'absolute', top: 38, left: 0, right: 0, height: 40,
      background: '#f1f3f4', display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 12, zIndex: 10,
    },
    urlInput: {
      flex: 1, height: 28, borderRadius: 14, background: '#ffffff',
      display: 'flex', alignItems: 'center', padding: '0 14px',
      fontSize: 13, color: '#5f6368',
    },
    content: (kind, statusBar, keyboard) => ({
      position: 'absolute',
      top: kind === 'ios' || kind === 'android' ? (statusBar ? 47 : 0) : kind === 'mac' ? 28 : 78,
      left: 0, right: 0,
      bottom: keyboard ? 291 : (kind === 'ios' ? 34 : kind === 'android' ? 28 : 0),
      overflow: 'auto',
    }),
  };

  function StatusBar({ kind, time }) {
    return React.createElement('div', { style: frameStyles.statusBar },
      React.createElement('span', null, time || '9:41'),
      React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        React.createElement('svg', { width: 18, height: 12, viewBox: '0 0 18 12', fill: '#000' },
          React.createElement('rect', { x: 0, y: 8, width: 3, height: 4, rx: 0.5 }),
          React.createElement('rect', { x: 5, y: 5, width: 3, height: 7, rx: 0.5 }),
          React.createElement('rect', { x: 10, y: 2, width: 3, height: 10, rx: 0.5 }),
          React.createElement('rect', { x: 15, y: 0, width: 3, height: 12, rx: 0.5 })
        ),
        React.createElement('svg', { width: 17, height: 12, viewBox: '0 0 17 12' },
          React.createElement('path', { d: 'M8.5 10.3c-2.4 0-4.5-.9-6.1-2.4l1-1c1.3 1.3 3.1 2 5.1 2s3.8-.7 5.1-2l1 1c-1.6 1.5-3.7 2.4-6.1 2.4zM8.5 6.2c-1.3 0-2.5.4-3.5 1.1l1 1c.7-.5 1.6-.8 2.5-.8s1.8.3 2.5.8l1-1c-1-.7-2.2-1.1-3.5-1.1z', fill: '#000' }),
          React.createElement('circle', { cx: 8.5, cy: 9.8, r: 1, fill: '#000' })
        ),
        React.createElement('div', { style: { width: 25, height: 12, border: '1px solid #000', borderRadius: 3, padding: 1.5, position: 'relative' } },
          React.createElement('div', { style: { width: '80%', height: '100%', background: '#000', borderRadius: 1 } }),
          React.createElement('div', { style: { position: 'absolute', right: -3, top: 3, width: 2, height: 4, background: '#000', borderRadius: '0 1px 1px 0' } })
        )
      )
    );
  }

  function DeviceFrame({
    kind = 'ios',
    keyboard = false,
    statusBar = true,
    time = '9:41',
    url = 'example.com',
    title = 'Untitled',
    children,
  }) {
    const size = SIZES[kind];
    if (!size) throw new Error(`DeviceFrame: unknown kind "${kind}"`);

    return React.createElement('div', { style: frameStyles.shell(kind), 'data-device-frame': kind },
      React.createElement('div', { style: frameStyles.screen(kind) },
        // iOS chrome
        kind === 'ios' && React.createElement(React.Fragment, null,
          statusBar && React.createElement(StatusBar, { kind, time }),
          React.createElement('div', { style: frameStyles.dynamicIsland }),
          React.createElement('div', { style: frameStyles.homeIndicator })
        ),
        // Android chrome
        kind === 'android' && React.createElement(React.Fragment, null,
          statusBar && React.createElement(StatusBar, { kind, time }),
          React.createElement('div', { style: frameStyles.punchHole }),
          React.createElement('div', { style: frameStyles.gestureBar })
        ),
        // Mac chrome
        kind === 'mac' && React.createElement('div', { style: frameStyles.macTitleBar },
          React.createElement('div', { style: frameStyles.trafficLights },
            React.createElement('div', { style: frameStyles.tl('#ff5f57') }),
            React.createElement('div', { style: frameStyles.tl('#febc2e') }),
            React.createElement('div', { style: frameStyles.tl('#28c840') })
          ),
          React.createElement('div', { style: frameStyles.macTitle }, title)
        ),
        // Browser chrome
        kind === 'browser' && React.createElement(React.Fragment, null,
          React.createElement('div', { style: frameStyles.browserTabs },
            React.createElement('div', { style: frameStyles.trafficLightsBrowser },
              React.createElement('div', { style: frameStyles.tl('#ff5f57') }),
              React.createElement('div', { style: frameStyles.tl('#febc2e') }),
              React.createElement('div', { style: frameStyles.tl('#28c840') })
            ),
            React.createElement('div', { style: frameStyles.tab(true) },
              React.createElement('div', { style: { width: 14, height: 14, borderRadius: 2, background: '#888' } }),
              React.createElement('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, title)
            )
          ),
          React.createElement('div', { style: frameStyles.urlBar },
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('div', { style: { width: 28, height: 28, borderRadius: 14, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368', fontSize: 18 } }, '‹'),
              React.createElement('div', { style: { width: 28, height: 28, borderRadius: 14, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368', fontSize: 18 } }, '›'),
              React.createElement('div', { style: { width: 28, height: 28, borderRadius: 14, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368', fontSize: 14 } }, '⟳')
            ),
            React.createElement('div', { style: frameStyles.urlInput }, url)
          )
        ),
        // Content area
        React.createElement('div', { style: frameStyles.content(kind, statusBar, keyboard) }, children),
        // Keyboard (iOS/Android)
        keyboard && (kind === 'ios' || kind === 'android') &&
          React.createElement('div', { style: frameStyles.keyboard })
      )
    );
  }

  Object.assign(window, { DeviceFrame });
})();
