export const CloseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
            <g opacity="0.7">
                <path d="M12 4L4 12M4 4L12 12" stroke="#18181B" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
            </g>
        </svg>
    )
}

export const WalletIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" viewBox="0 0 24 25" fill="none" {...props}>
            <path d="M19 7.5V4.5C19 4.23478 18.8946 3.98043 18.7071 3.79289C18.5196 3.60536 18.2652 3.5 18 3.5H5C4.46957 3.5 3.96086 3.71071 3.58579 4.08579C3.21071 4.46086 3 4.96957 3 5.5M3 5.5C3 6.03043 3.21071 6.53914 3.58579 6.91421C3.96086 7.28929 4.46957 7.5 5 7.5H20C20.2652 7.5 20.5196 7.60536 20.7071 7.79289C20.8946 7.98043 21 8.23478 21 8.5V12.5M3 5.5V19.5C3 20.0304 3.21071 20.5391 3.58579 20.9142C3.96086 21.2893 4.46957 21.5 5 21.5H20C20.2652 21.5 20.5196 21.3946 20.7071 21.2071C20.8946 21.0196 21 20.7652 21 20.5V16.5M21 12.5H18C17.4696 12.5 16.9609 12.7107 16.5858 13.0858C16.2107 13.4609 16 13.9696 16 14.5C16 15.0304 16.2107 15.5391 16.5858 15.9142C16.9609 16.2893 17.4696 16.5 18 16.5H21M21 12.5C21.2652 12.5 21.5196 12.6054 21.7071 12.7929C21.8946 12.9804 22 13.2348 22 13.5V15.5C22 15.7652 21.8946 16.0196 21.7071 16.2071C21.5196 16.3946 21.2652 16.5 21 16.5" stroke={props.stroke ?? '#71717A'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export const CopyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none" {...props}>
            <g clipPath="url(#clip0_87_12416)">
                <path d="M1.66665 6.66659C1.20831 6.66659 0.833313 6.29159 0.833313 5.83325V1.66659C0.833313 1.20825 1.20831 0.833252 1.66665 0.833252H5.83331C6.29165 0.833252 6.66665 1.20825 6.66665 1.66659M4.16665 3.33325H8.33331C8.79355 3.33325 9.16665 3.70635 9.16665 4.16659V8.33325C9.16665 8.79349 8.79355 9.16659 8.33331 9.16659H4.16665C3.70641 9.16659 3.33331 8.79349 3.33331 8.33325V4.16659C3.33331 3.70635 3.70641 3.33325 4.16665 3.33325Z" stroke="#71717A" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <defs>
                <clipPath id="clip0_87_12416">
                    <rect width="10" height="10" fill="white" />
                </clipPath>
            </defs>
        </svg>
    )
}

export const CopiedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
            <path
                fill={props.fill || '#71717A'}
                d="m11.602 13.76 1.412 1.412 8.466-8.466 1.414 1.415-9.88 9.88-6.364-6.365 1.414-1.414 2.125 2.125zm.002-2.828 4.952-4.953 1.41 1.41-4.952 4.953zm-2.827 5.655L7.364 18 1 11.636l1.414-1.414 1.413 1.413-.001.001z"
            />
        </svg>
    )
}