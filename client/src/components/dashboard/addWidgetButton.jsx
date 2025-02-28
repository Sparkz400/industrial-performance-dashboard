// File: src/components/dashboard/addWidgetButton.jsx
import React from 'react';
import './addWidgetButton.css'; // Fixed import path to match actual file name

const AddWidgetButton = ({ onClick }) => {
    return (
        <button className="BtnAddWidget" onClick={onClick}>
            <div className="BtnAddWidgetSign">+</div>
            <div className="BtnAddWidgetText">Add Widget</div>
        </button>
    );
};

export default AddWidgetButton;