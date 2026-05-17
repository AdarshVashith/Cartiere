import { auth } from '../firebase/firebase'

const BACKEND_URL = 'https://styleai-backend-adarsh-vashishthas-projects.vercel.app'

export default async function callBackend(path, body) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('You need to be signed in to continue.')
  }

  const token = await user.getIdToken()
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}
