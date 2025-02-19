
import { DateTime } from 'luxon'

// Generates an HSL colour with enough contrast to display white text
// The colour text contrast has been tested here: https://codepen.io/OliverBalfour/pen/YzrRoXJ
const stringColorMap = {}
const hues = [0, 120, 240, 60, 180, 300, 30, 90, 150, 210, 270, 330, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345]
export const stringToColor = str => {
  if (!(str in stringColorMap)) {
    const hue = hues[Object.keys(stringColorMap).length % hues.length]
    const offset = 60; // configurable
    stringColorMap[str] = `hsl(${(hue + offset) % 360}, 100%, 30%)`;
  }
  return stringColorMap[str]
}

// hardcode to semester 1 or 2 as users usually want them
// allows app to function even if /sessions endpoint is down
export const getInitialState = () => {
  const qs = new URLSearchParams(window.location.search)
  let year = qs.get('y')
  let session = qs.get('s')

  let now = new Date()
  if (!session) {
    let month = now.getMonth()

    // If semester 2 complete (after Sept), default to next year
    if (!year && month > 9) {
      year = now.getFullYear()+1
      session = 'S1'
    } else {
      session = month < 5 ? 'S1' : 'S2'
    }
  }

  let hidden = qs.get('hide')?.split(',')?.map(x => {
    const [module, groupId, occurrence] = x.split('_')
    return [module, groupId, parseInt(occurrence)]
  }) ?? []

  qs.delete('y')
  qs.delete('s')
  qs.delete('hide')

  // loosely filter to avoid potential data issues, should exclude these: https://maxchadwick.xyz/tracking-query-params-registry/
  const moduleFormat = ([param]) => {
    const valid = param.match(/[0-9]/)
    if (!valid) unsetQueryParam(param)
    return valid
  }

  return [year || now.getFullYear(), session, Array.from(qs.entries()).filter(moduleFormat) || [], hidden]
}

export const setQueryParam = (param, value) => {
  const qs = new URLSearchParams(window.location.search)
  qs.set(param, value ?? qs.get(param) ?? '') // if no value, just ensure param exists
  window.history.replaceState(null, '', '?'+qs.toString())
}

export const unsetQueryParam = param => {
  const qs = new URLSearchParams(window.location.search)
  qs.delete(param)
  window.history.replaceState(null, '', '?'+qs.toString())
}

export const getStartOfSession = () => {
  const [year, session] = getInitialState()
  return {
    '2022S1': new Date('2022-02-20T21:00:00Z'), // 8AM 21 Feb in GMT
  }?.[year + session]
}

export const fetchJsObject = (path, callback) => {
  try {
    fetch(path).then(res => {
      if (!res.ok) return
      else res.json().then(json => callback(json))
    })
  } catch (err) {
    console.error(err)
  }
}

// Creates a list of event objects the calendar can consume
// One for each lecture/lab time/etc. for a given course and session
// These events have a recurrence rule (rrule) so one event object in the returned
// list may represent several events recurring at the same time each week
export const parseEvents = (classes, year, session, id /* course code */) => {
  const activitiesWithMultipleOccurrences = classes.map(c => c.activity).filter((e, i, a) => a.indexOf(e) !== i && a.lastIndexOf(e) === i)
return classes.map(c => {
  const location = c.location
  const occurrence = parseInt(c.occurrence)

  const title = [
    c.module,
    c.activity,
    ...(c.activity.startsWith('Lec') ? [] : [occurrence])
  ].join(' ')

  const inclusiveRange = ([start, end]) => (end && Array.from({ length: end-start+1 }, (_, i) => start+i)) || [start]
  // '1\u20113,5\u20117' (1-3,6-8) => [1,2,3,6,7,8]
  // '8' => [8]
  const weeks = c.weeks.split(',').flatMap(w => inclusiveRange(w.split('\u2011').map(x => parseInt(x))))

  const [start, end] = [
    [weeks[0], c.start],
    [weeks[weeks.length-1], c.finish]
  ].map(([week, time]) => DateTime
    .fromFormat(time, 'HH:mm', { zone: 'UTC' })
    .set({ weekYear: year, weekNumber: week, weekday: c.day+1 }) // ANU 0-offset => Luxon 1-offset
  )
  
  // handles timezone across days/weeks, not verified across years
  const rrule = {
    freq: 'weekly',
    dtstart: start.toJSDate(),
    until: end.toJSDate(),
    byweekday: start.weekday-1, // Luxon 1-offset => rrule 0-offset
    byweekno: weeks, // rrule allows RFC violation (compliant byweekno requires freq=YEARLY)
    tzid: 'Australia/Canberra'
  }
  
  return {
    // extendedProps
    ...c,
    occurrence,
    hasMultipleOccurrences: activitiesWithMultipleOccurrences.indexOf(c.activity) !== -1,

    // custom ID allows removal of events that aren't in memory (ie only available by getEventById())
    id: [c.module, c.activity, occurrence].join('_'),
    title,
    groupId: c.activity, // identifies selection groups eg TutA
    location,
    duration: c.duration,
    rrule
  }
})
}

// Upon trigger downloads a blob of data to the browser with the given file name
export const saveAs = (blob, fileName) => {
  // Create temp invisible element
  var elem = window.document.createElement('a');
  elem.href = blob
  elem.download = fileName;
  elem.style = 'display:none;';

  // append element to the DOM
  (document.body || document.documentElement).appendChild(elem);

  // Dispatch a click event to trigger the download
  if (typeof elem.click === 'function') {
    elem.click();
  } else {
    elem.target = '_blank';
    elem.dispatchEvent(new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    }));
  }
  URL.revokeObjectURL(elem.href);

  // Remove the temp element from the DOM
  elem.remove()
}

// This function crops a given canvas, taken from https://stackoverflow.com/questions/13073647/crop-canvas-export-html5-canvas-with-certain-width-and-height
export const cropCanvas = (sourceCanvas, left, top, width, height) => {
  let destCanvas = document.createElement('canvas');
  destCanvas.width = width;
  destCanvas.height = height;
  destCanvas.getContext("2d").drawImage(
    sourceCanvas,
    left, top, width, height,  // source rect with content to crop
    0, 0, width, height);      // newCanvas, same size as source rect
  return destCanvas;
}