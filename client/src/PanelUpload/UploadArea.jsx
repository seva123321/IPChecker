import React from 'react'
import { Upload, Button, message } from 'antd'
import { CloseOutlined, UploadOutlined } from '@ant-design/icons'
import { List } from '../List'
import cn from './PanelUpload.module.scss'

const { Dragger } = Upload

export const UploadArea = ({
  activeTab,
  fileList,
  setFileList,
  uploading,
  onUpload,
  uploadText,
  uploadHint,
}) => {
  const accept = activeTab === 'ip' ? '.txt' : '.json'

  const beforeUpload = (file, files) => {
    const isCorrectType = file.name.endsWith(accept)
    if (!isCorrectType) {
      message.error(`Неверный формат. Ожидался ${accept}`)
      return false
    }
    // Разрешаем несколько файлов
    setFileList((prev) => [...prev, file])
    return false // не загружать автоматически
  }

  const onRemove = (file) => {
    const newFileList = fileList.filter((item) => item.uid !== file.uid)
    setFileList(newFileList)
  }

  return (
    <div className={cn['upload-area']}>
      <Dragger
        name="files"
        multiple // ← разрешаем несколько файлов
        fileList={[]}
        beforeUpload={beforeUpload}
        accept={accept}
        showUploadList={false}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined style={{ fontSize: 28, color: '#1890ff' }} />
        </p>
        {/* <p className="ant-upload-text">
          Перетащите файлы сюда или <u>нажмите для выбора</u>
        </p>
        <p className="ant-upload-hint">
          Поддерживаемый формат: <strong>{accept}</strong>
        </p> */}
        <p className="ant-upload-text">
          {uploadText}
        </p>
        <p className="ant-upload-hint">
          {uploadHint}
        </p>
      </Dragger>
      <List
        items={fileList}
        render={(item) => (
          <div className={cn['file-list-item']}>
            <span className={cn['file-name']}>{item.name}</span>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => onRemove(item)}
              className={cn['file-remove-btn']}
            />
          </div>
        )}
      />
      <Button
        type="primary"
        onClick={() => onUpload(fileList)}
        loading={uploading}
        disabled={fileList.length === 0}
        size="middle"
      >
        Отправить
      </Button>
    </div>
  )
}
