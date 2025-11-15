import { MainPage } from './MainPage'
import { ApiService } from './ApiService'

function App() {
  return (
    <div>
      <MainPage service={ApiService} />
    </div>
  )
}

export default App
