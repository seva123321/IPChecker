// components/DatePicker/DatePicker.jsx
import { useState } from 'react'
import { ConfigProvider, DatePicker } from 'antd'
import 'antd/dist/reset.css'
import ruRU from 'antd/locale/ru_RU'
import dayjs from 'dayjs'
import { memo, useCallback } from 'react'
import style from './DatePicker.module.css'

const { RangePicker } = DatePicker

const DateRangeFieldForm = memo(({ dateRange, setDateRange }) => {
  const disabledDate = useCallback((current) => {
    return current && current > dayjs().endOf('day')
  }, [])

  return (
    <ConfigProvider locale={ruRU}>
      <div className={style.date__wrapper}>
        <h4 className={style.date__header}>Выберите диапазон дат</h4>
        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          format="DD.MM.YYYY"
          disabledDate={disabledDate}
          className={`${style['date__range-picker']} ${style['date__range-picker--no-hover']}`}
          inputReadOnly
          placeholder={['Начало', 'Окончание']}
        />
      </div>
    </ConfigProvider>
  )
})

export default DateRangeFieldForm

// /* eslint-disable no-unused-vars */
// import { useState } from 'react'
// import { ConfigProvider, DatePicker } from 'antd'
// import 'antd/dist/reset.css'
// import ruRU from 'antd/locale/ru_RU'
// import dayjs from 'dayjs'

// import { memo, useCallback } from 'react'

// import style from './DatePicker.module.css'

// const { RangePicker } = DatePicker

// const DateRangeFieldForm = memo(({dateRange, setDateRange}) => {
//   // const [dateRange, setDateRange] = useState(null)

//   const disabledDate = useCallback((current) => {
//     return current && current > dayjs().endOf('day')
//   }, [])

//   return (
//     <ConfigProvider locale={ruRU}>
//       <div className={style.date__wrapper}>
//         <h4 className={style.date__header}>Выберите диапазон дат</h4>
//         <RangePicker
//           value={dateRange}
//           onChange={setDateRange}
//           format="DD.MM.YYYY"
//           disabledDate={disabledDate}
//           className={`${style['date__range-picker']} ${style['date__range-picker--no-hover']}`}
//           inputReadOnly
//           placeholder={['Начало', 'Окончание']}
//         />
//       </div>
//     </ConfigProvider>
//   )
// })

// export default DateRangeFieldForm
