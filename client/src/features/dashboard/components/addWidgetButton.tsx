import React from 'react';
import './addWidgetButton.css';

interface AddWidgetButtonProps {
  onClick: () => void;
}

const AddWidgetButton: React.FC<AddWidgetButtonProps> = ({ onClick }) => (
  <button className="BtnAddWidget" aria-label="Add Widget" onClick={onClick}>
    <div className="BtnAddWidgetSign">+</div>
    <div className="BtnAddWidgetText">Add Widget</div>
  </button>
);

export default AddWidgetButton;
