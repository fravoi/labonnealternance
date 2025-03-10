import { factorJobsForMap, factorTrainingsForMap, setJobMarkers, setTrainingMarkers } from "../../../utils/mapTools"

export const storeTrainingsInSession = ({ trainings, searchTimestamp }) => {
  try {
    const search = JSON.parse(sessionStorage.getItem(searchTimestamp))
    sessionStorage.setItem(searchTimestamp, JSON.stringify({ trainings, ...search }))
    trimSessionStorage()
  } catch (err) {
    console.log("sessionStorage error : ", err)
  }
}

export const storeJobsInSession = ({ jobs, searchTimestamp }) => {
  try {
    const search = JSON.parse(sessionStorage.getItem(searchTimestamp))
    sessionStorage.setItem(searchTimestamp, JSON.stringify({ jobs, ...search }))
    trimSessionStorage()
  } catch (err) {
    console.log("sessionStorage error : ", err)
  }
}

const trimSessionStorage = () => {
  let oldest = 0

  if (sessionStorage.length > 15) {
    for (let i = 0, l = sessionStorage.length; i < l; ++i) {
      const currentKey = parseInt(sessionStorage.key(i))
      if (!oldest || currentKey < oldest) {
        oldest = currentKey
      }
    }

    if (oldest) {
      sessionStorage.removeItem(`${oldest}`)
    }
  }
}

export const restoreSearchFromSession = ({ searchTimestamp, setTrainings, setJobs }) => {
  const search = JSON.parse(sessionStorage.getItem(searchTimestamp))

  if (search?.jobs) {
    setJobs(search.jobs)
    setJobMarkers({ jobList: factorJobsForMap(search.jobs), hasTrainings: search?.trainings })
  }

  if (search?.trainings) {
    setTrainings(search.trainings)
    setTrainingMarkers({ trainingList: factorTrainingsForMap(search.trainings) })
  }
}
