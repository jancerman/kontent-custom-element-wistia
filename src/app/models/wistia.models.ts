export interface IWistiaProject {
    id: string;
    name: string;
    description?: string;
    mediaCount: number;
}

export interface IWistiaVideo {
    id: number;
    name: string;
    description?: string;
    created: string;
    updated: string;
    duration: number;
    type: string;
    thumbnail: {
        url: string;
        width: number;
        height: number;
    };
    project: {
        id: string;
        name: string;
    };
}

export interface IWistiaVideosResponse {
    hasMoreItems: boolean;
    videos: IWistiaVideo[];
}
