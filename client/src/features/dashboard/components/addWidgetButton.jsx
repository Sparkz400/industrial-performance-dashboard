import React from 'react';
import './addWidgetButton.css';

const AddWidgetButton = ({ onClick }) => {
    return (
        <button className="BtnAddWidget" onClick={onClick}>
            <div className="BtnAddWidgetSign">+</div>
            <div className="BtnAddWidgetText">Add Widget</div>
        </button>
    );
};

export default AddWidgetButton;