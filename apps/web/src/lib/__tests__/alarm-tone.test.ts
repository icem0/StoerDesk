import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isAlarmToneEnabled,
  onAlarmToneChange,
  playAlarmTone,
  setAlarmToneEnabled,
} from '../alarm-tone'

/**
 * The alarm tone of the inbox (`specs/10-notifications.md` §11.12): the choice
 * belongs to **this** browser and starts off, so nobody is surprised by a tone on
 * a stranger's device. The tone is built from the Web Audio oscillators of the
 * browser — no audio file — and a browser without Web Audio, a browser that
 * refuses the storage and a device without output stay silent.
 *
 * The stubs below are the browser: a storage that keeps the choice, a storage
 * that refuses it and a context of Web Audio that counts the oscillators.
 */
function stubStorage(refuses = false) {
  const store = new Map<string, string>()

  Reflect.deleteProperty(window, 'localStorage')

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (refuses ? null : (store.get(key) ?? null)),
      setItem: (key: string, value: string) => {
        if (refuses) {
          throw new Error('storage refused')
        }

        store.set(key, value)
      },
      removeItem: (key: string) => store.delete(key),
    },
  })
}

/** A browser with Web Audio: every oscillator is counted, nothing is heard. */
function stubAudioContext() {
  const started: number[] = []

  class FakeOscillator {
    frequency = { value: 0 }
    type = 'sine'

    connect() {}

    start() {
      started.push(this.frequency.value)
    }

    stop() {}
  }

  class FakeGain {
    gain = {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    }

    connect() {}
  }

  Reflect.deleteProperty(window, 'AudioContext')

  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: class {
      state = 'running'
      currentTime = 0
      destination = {}

      createOscillator() {
        return new FakeOscillator()
      }

      createGain() {
        return new FakeGain()
      }

      resume() {
        return Promise.resolve()
      }
    },
  })

  return started
}

afterEach(() => {
  Reflect.deleteProperty(window, 'localStorage')
  Reflect.deleteProperty(window, 'AudioContext')
  vi.restoreAllMocks()
})

describe('alarm tone', () => {
  it('is off in a fresh browser', () => {
    stubStorage()

    expect(isAlarmToneEnabled()).toBe(false)
  })

  it('keeps the choice of this browser', () => {
    stubStorage()

    setAlarmToneEnabled(true)

    expect(isAlarmToneEnabled()).toBe(true)

    // The choice belongs to the browser, not to the session: a second read of
    // the storage answers the same.
    expect(window.localStorage.getItem('stoerdesk.alarm-tone')).toBe('on')

    setAlarmToneEnabled(false)

    expect(isAlarmToneEnabled()).toBe(false)
  })

  it('stays silent when the browser refuses the storage', () => {
    stubStorage(true)

    expect(() => setAlarmToneEnabled(true)).not.toThrow()
    expect(isAlarmToneEnabled()).toBe(false)
  })

  it('reports the change of the choice and stops on unsubscribe', () => {
    stubStorage()

    const seen: boolean[] = []
    const unsubscribe = onAlarmToneChange((enabled) => seen.push(enabled))

    setAlarmToneEnabled(true)

    expect(seen).toEqual([true])

    unsubscribe()

    setAlarmToneEnabled(false)

    expect(seen).toEqual([true])
  })

  it('sounds two tones and never throws without Web Audio', () => {
    const started = stubAudioContext()
    stubStorage()

    expect(() => playAlarmTone()).not.toThrow()
    expect(started).toHaveLength(2)

    Reflect.deleteProperty(window, 'AudioContext')

    expect(() => playAlarmTone()).not.toThrow()
  })
})
