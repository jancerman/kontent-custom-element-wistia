import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { of } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CoreComponent } from './core/core.component';
import { IWistiaProject, IWistiaVideo } from './models/wistia.models';
import { KontentService } from './services/kontent.service';
import { WistiaService } from './services/wistia.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent extends CoreComponent implements OnInit, AfterViewChecked {
    // readonly setup
    public readonly wistiaTokenVariable: string = 'wistiaAccessToken';
    public readonly dropInElementId: string = 'WistiaUploaderElem';
    private readonly pageSize: number = 9;

    // config
    public accessToken?: string;

    // base
    public loading: boolean = false;
    public isDisabled: boolean = true;
    public initialized: boolean = false;
    public errorMessage?: string;

    // uploader
    public showUploader: boolean = false;

    // projects
    public projects: IWistiaProject[] = [];
    public selectedProject?: IWistiaProject;
    public projectsPerRow: number = 3;
    public projectsPerRowGap: string = '24px';

    // videos
    public showFileNotFoundError: boolean = false;
    public videosPerRow: number = 3;
    public videosPerRowGap: string = '24px';
    public showLoadMoreVideos: boolean = false;
    public selectedVideo?: IWistiaVideo;
    public videosPage: number = 1;
    public videos: IWistiaVideo[] = [];
    public currentSearch?: string;
    public searchControl: FormControl = new FormControl();

    constructor(private wistiaService: WistiaService, private kontentService: KontentService, cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnInit(): void {
        this.initSearch();
        this.initDisabledChanged();

        if (this.isKontentContext()) {
            this.kontentService.initCustomElement(
                (data) => {
                    if (data.accessToken) {
                        this.accessToken = data.accessToken;
                        this.isDisabled = data.isDisabled;
                        this.initialized = true;

                        super.detectChanges();

                        this.initProjects(data.accessToken, data.value);
                    }
                },
                (error) => {
                    this.initialized = true;
                    console.error(error);
                    this.errorMessage = `Could not initialize custom element. Custom elements can only be embedded in an iframe`;
                    super.detectChanges();
                }
            );
        } else {
            this.accessToken = this.getDefaultAccessToken();
            this.isDisabled = false;
            this.initialized = true;

            if (this.accessToken) {
                this.initProjects(this.accessToken, this.getDefaultFileId());
            }
        }
    }

    ngAfterViewChecked(): void {
        // update size of Kontent UI
        if (this.isKontentContext()) {
            // this is required because otherwise the offsetHeight can return 0 in some circumstances
            // https://stackoverflow.com/questions/294250/how-do-i-retrieve-an-html-elements-actual-width-and-height
            setTimeout(() => {
                const htmlElement = document.getElementById('htmlElem');
                if (htmlElement) {
                    const height = htmlElement.offsetHeight;
                    this.kontentService.updateSizeToMatchHtml(height);
                }
            }, 50);
        }
    }

    handleHideUploader(): void {
        this.showUploader = false;
    }

    handleShowUploader(): void {
        if (!this.accessToken || !this.selectedProject) {
            return;
        }
        this.initUploader(this.dropInElementId, this.accessToken, this.selectedProject.id);
    }

    handleLoadMoreVideos(): void {
        if (!this.accessToken || !this.selectedProject) {
            return;
        }
        this.videosPage++;
        this.loadVideos(this.accessToken, this.selectedProject.id, this.pageSize, this.videosPage, this.currentSearch);
    }

    handleUnselectProject(): void {
        this.selectedProject = undefined;
        this.videos = [];
        this.videosPage = 1;
        this.currentSearch = undefined;
        this.handleHideUploader();
    }

    handleSelectProject(project: IWistiaProject): void {
        if (!this.accessToken) {
            return;
        }
        this.selectedProject = project;
        this.videos = [];
        this.videosPage = 1;

        this.loadVideos(this.accessToken, project.id, this.pageSize, this.videosPage, this.currentSearch);
    }

    handleSelectVideo(video: IWistiaVideo): void {
        this.setSelectedVideo(video);
    }

    getVideoDate(video: IWistiaVideo): string {
        return new Date(video.updated).toLocaleDateString();
    }

    handleClearSelectedVideo(): void {
        this.setSelectedVideo(undefined);
    }

    setUploadFileAsUploaded(fileId: string) {
        if (!this.accessToken) {
            return;
        }
        super.subscribeToObservable(
            this.wistiaService.videoInfo(this.accessToken, fileId).pipe(
                map((video) => {
                    const candidateProject = this.projects.find((m) => m.id === video.project.id);

                    if (candidateProject) {
                        this.selectedProject = candidateProject;
                    }

                    this.setSelectedVideo(video);

                    this.handleHideUploader();
                    super.detectChanges();
                })
            )
        );
    }

    private setSelectedVideo(video: IWistiaVideo | undefined): void {
        this.selectedVideo = video;

        if (this.isKontentContext()) {
            this.kontentService.setValue(video?.id.toString());
        }
    }

    private initDisabledChanged(): void {
        super.subscribeToObservable(
            this.kontentService.disabledChanged.pipe(
                map((disabled) => {
                    this.isDisabled = disabled;
                    super.detectChanges();
                })
            )
        );
    }

    private initSearch(): void {
        super.subscribeToObservable(
            this.searchControl.valueChanges.pipe(
                debounceTime(150),
                switchMap((value) => {
                    this.videosPage = 1;
                    this.currentSearch = value;

                    if (this.accessToken && this.selectedProject) {
                        return this.wistiaService
                            .listVideos(
                                this.accessToken,
                                this.selectedProject.id,
                                this.pageSize,
                                this.videosPage,
                                this.currentSearch
                            )
                            .pipe(
                                map((videosResponse) => {
                                    this.videos = videosResponse.videos;
                                    this.showLoadMoreVideos = videosResponse.hasMoreItems;
                                    super.detectChanges();
                                })
                            );
                    }

                    return of(undefined);
                }),
                map((value) => {
                    super.detectChanges();
                })
            )
        );
    }

    private loadVideos(
        accessToken: string,
        projectId: string,
        pageSize: number,
        page: number,
        search: string | undefined
    ): void {
        super.subscribeToObservable(
            this.wistiaService.listVideos(accessToken, projectId, pageSize, page, search).pipe(
                map((videosResponse) => {
                    this.videos.push(...videosResponse.videos);
                    this.showLoadMoreVideos = videosResponse.hasMoreItems;

                    super.detectChanges();
                })
            )
        );
    }

    private initUploader(elementId: string, accessToken: string, projectId: string): void {
        this.showUploader = true;
        (window as any)._wapiq = (window as any)._wapiq || [];
        (window as any)._wapiq.push((W: any) => {
            const uploader = new W.Uploader({
                accessToken,
                dropIn: elementId,
                projectId
            });
            (window as any).wistiaUploader = uploader;

            uploader.bind('uploadsuccess', (file: any, media: any) => {
                // reload projects as the number of files changed
                this.initProjects(accessToken);
            });
        });
    }

    private initProjects(accessToken: string, currentVideoId?: string): void {
        this.loading = true;
        super.subscribeToObservable(
            this.wistiaService.listProjects(accessToken).pipe(
                switchMap((projects) => {
                    this.projects = projects.sort((a, b) => {
                        if (a.name < b.name) {
                            return -1;
                        }
                        if (a.name > b.name) {
                            return 1;
                        }
                        return 0;
                    });

                    if (!currentVideoId) {
                        return of(undefined);
                    }

                    return this.wistiaService.videoInfo(accessToken, currentVideoId).pipe(
                        map((video) => {
                            const candidateProject = this.projects.find((m) => m.id === video.project.id);

                            if (candidateProject) {
                                this.selectedProject = candidateProject;
                            }

                            this.selectedVideo = video;

                            return video;
                        }),
                        catchError((error) => {
                            this.showFileNotFoundError = true;
                            console.warn(`Could not load file with id '${currentVideoId}'`);
                            console.error(error);

                            return of(undefined);
                        })
                    );
                }),
                switchMap((video) => {
                    if (video) {
                        // init media from the same project as is video
                        return this.wistiaService
                            .listVideos(
                                accessToken,
                                video.project.id,
                                this.pageSize,
                                this.videosPage,
                                this.currentSearch
                            )
                            .pipe(
                                map((videosResponse) => {
                                    this.videos = videosResponse.videos;
                                    this.showLoadMoreVideos = videosResponse.hasMoreItems;
                                })
                            );
                    }

                    return of(undefined);
                }),
                map(() => {
                    this.loading = false;
                    super.detectChanges();
                })
            )
        );
    }

    private getDefaultAccessToken(): string | undefined {
        if (this.isKontentContext()) {
            return undefined;
        }

        return environment.wistia.accessToken;
    }

    private getDefaultFileId(): string | undefined {
        if (this.isKontentContext()) {
            return undefined;
        }

        return environment.wistia.defaultFileId;
    }

    private isKontentContext(): boolean {
        return environment.production;
    }
}
