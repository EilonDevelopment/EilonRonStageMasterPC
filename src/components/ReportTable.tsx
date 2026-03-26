import React, { FC } from "react";

interface ReportTableProps {
    title: string;
    data: any[];
}

const ReportTable: FC <ReportTableProps> = props => {
    const {
        title,
        data,
    } = props;

    return (
        <div>
            {title}
            {data}
        </div>
    )
}

export default ReportTable;
