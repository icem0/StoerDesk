/**
 * The optional alarm tone of the inbox (`specs/10-notifications.md` §11.12):
 * an alarm system is heard, not only read. The choice belongs to this browser
 * and not to the account, so nobody is surprised by a tone on a stranger's
 * device — the tone starts off. The inbox writes the choice, the bell of the
 * shell reads it; a window event carries a change from one to the other without
 * a reload.
 *
 * The tone is built from the Web Audio oscillators of the browser: no audio
 * file, no download and no licence question. A browser without Web Audio, a
 * browser that blocks the storage and a device without sound stay silent — the
 * tone is a help, never a precondition of the inbox.
 */

const STORAGE_KEY = 'stoerdesk.alarm-tone'
const CHANGE_EVENT = 'stoerdesk:alarm-tone'

/** Is the alarm tone switched on for this browser? */
export function isAlarmToneEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

/** Switches the alarm tone on or off for this browser and tells the bell. */
export function setAlarmToneEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // A browser that refuses the storage keeps the tone off for this visit.
  }

  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: enabled }))
}

/** Listens for a change of the choice; returns the unsubscribe function. */
export function onAlarmToneChange(listener: (enabled: boolean) => void): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<boolean>).detail === true)
  }

  window.addEventListener(CHANGE_EVENT, handler)

  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

let audio: AudioContext | null = null

function audioContext(): AudioContext | null {
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (ctor === undefined) {
    return null
  }

  audio ??= new ctor()

  return audio
}

/**
 * Plays the short two-tone alarm of a new message. The call never throws: a
 * browser without Web Audio, a context that the browser keeps suspended and a
 * device without output simply stay silent.
 */
export function playAlarmTone(): void {
  const context = audioContext()

  if (context === null) {
    return
  }

  if (context.state === 'suspended') {
    void context.resume()
  }

  const now = context.currentTime
  const tones: ReadonlyArray<readonly [number, number]> = [
    [0, 880],
    [0.18, 1180],
  ]

  for (const [offset, frequency] of tones) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now + offset)
    oscillator.stop(now + offset + 0.18)
  }
}
