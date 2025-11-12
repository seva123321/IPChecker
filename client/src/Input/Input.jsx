import cn from './Input.module.css'
import { forwardRef } from 'react'

export const Input = forwardRef(
  (
    {
      value,
      onChange,
      placeholder,
      containerClass = {},
      showClear = false,
      onClear,
      suffix,
      errorMessage = '',
      ...props
    },
    ref
  ) => {
    const containerStyle = {
      width: containerClass.width,
      marginRight: containerClass.marginRight,
      position: 'relative',
      display: 'inline-block',
    }
    return (
      <div style={containerStyle}>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${cn.input} ${errorMessage ? cn.error : ''}`}
          {...props}
        />
        {showClear && value && (
          <button
            type="button"
            className={cn.clearButton}
            onClick={onClear}
            aria-label="Очистить"
          >
            ×
          </button>
        )}
        {suffix}
        {errorMessage && <div className={cn.errorText}>{errorMessage}</div>}
      </div>
    )
  }
)
// import cn from './Input.module.css'
// import { forwardRef } from 'react'

// export const Input = forwardRef(
//   (
//     {
//       value,
//       onChange,
//       placeholder,
//       containerClass = {},
//       showClear = false,
//       onClear,
//       ...props
//     },
//     ref
//   ) => {
//     const containerStyle = {
//       width: containerClass.width,
//       marginRight: containerClass.marginRight,
//       position: 'relative',
//       display: 'inline-block',
//     }

//     return (
//       <div style={containerStyle}>
//         <input
//           ref={ref}
//           type="text"
//           value={value}
//           onChange={onChange}
//           placeholder={placeholder}
//           className={cn.input}
//           {...props}
//         />
//         {showClear && value && (
//           <button
//             type="button"
//             className={cn.clearButton}
//             onClick={onClear}
//             aria-label="Очистить"
//           >
//             ×
//           </button>
//         )}
//       </div>
//     )
//   }
// )

// import { forwardRef } from 'react'

// import styles from './Input.module.css'

// export const Input = forwardRef(
//   (
//     {
//       name = '',
//       type = 'text',
//       label = '',
//       placeholder = '',
//       error = '',
//       useLabel = true,
//       containerClass = '',
//       ...props
//     },
//     ref
//   ) => {
//     const labelName = label || name

//     return (
//       <div className={`${(containerClass, styles.inputContainer)}`}>
//         {useLabel && (
//           <label htmlFor={name} className={styles?.label}>
//             {labelName}
//           </label>
//         )}

//         <input
//           ref={ref}
//           id={name}
//           type={type}
//           name={name}
//           placeholder={placeholder || name}
//           className={`${styles.input} ${error ? styles.error : ''}  ${props.disabled ? styles.disabled : ''}`}
//           {...props}
//         />
//       </div>
//     )
//   }
// )
