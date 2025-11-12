
// без пагинации
import { MainPage } from './MainPage'
import { ApiService } from './ApiService'

const service = new ApiService()
function App() {
  return (
    <div>
      <MainPage service={ApiService}/>
    </div>
  )
}

export default App

// пагинация scroll
// import React from 'react'
// import { MainPageInfiniteWithScroll  } from '../src/MainPageInfiniteWithScroll'
// import { ApiService } from './ApiService'

// function App() {
//   return (
//     <MainPageInfiniteWithScroll 
//       service={ApiService} 
//       endpoint="ip" // Указываем endpoint для запроса
//     />
//   )
// }

// export default App

// // пагинация кнопка
// import React from 'react'
// import { MainPageWithPagination } from '../src/MainPageWithPagination'
// import { ApiService } from './ApiService'

// function App() {
//   return (
//     <MainPageWithPagination 
//       service={ApiService} 
//       endpoint="ip" // Указываем endpoint для запроса
//     />
//   )
// }

// export default App



// App.jsx или ваш главный компонент
