import { Issue, Repository } from "@octokit/webhooks-types";
import { Maintainer, Config, fetchData, postData } from "./common.js";

export interface Task {
    repo: string,
    owner: string,
    github_issue_number: number,
    github_repo_id: number,
    github_issue_id: number,
    points?: number,
    task_status: TaskStatus,
    student_github_login?: string,
    mentor_github_login: string,
}

export enum TaskStatus {
    Open = "Open",
    Invalid = "Invalid",
    RequestAssign = "RequestAssign",
    Assigned = "Assigned",
    RequestFinish = "RequestFinish",
    Finished = "Finished",
}

export async function getTask(issue_id: number) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/issue/${issue_id}`;
    const res = await fetchData<Task>(apiUrl).then((res) => {
        return res.data
    });
    return res
}

interface TaskCreate {
    repo: string,
    owner: string,
    github_issue_number: number,
    github_repo_id: number,
    github_issue_id: number,
    score: number,
    mentor_github_login: string,
    github_issue_title: string,
    github_issue_link: string,
}

export async function newTask(repository: Repository, issue: Issue, score: number) {
    const req = {
        repo: repository.name,
        owner: repository.owner.login,
        github_issue_number: issue.number,
        github_repo_id: repository.id,
        github_issue_id: issue.id,
        score: score,
        mentor_github_login: issue.user.login,
        github_issue_title: issue.title,
        github_issue_link: issue.html_url,
    } as TaskCreate;
    const apiUrl = `${process.env.API_ENDPOINT}/task/new`;
    const res = await postData<Task[], TaskCreate>(apiUrl, req).then((res) => {
        return res.data
    });
    if (res != undefined) {
        return true
    } else {
        return false
    }
}

interface TaskUpdate {
    github_issue_id: number,
    github_issue_title: string,
    score: number,
}

export async function updateTaskScore(issue: Issue, score: number) {
    const req = {
        github_issue_id: issue.id,
        github_issue_title: issue.title,
        score: score,
    } as TaskUpdate;

    const apiUrl = `${process.env.API_ENDPOINT}/task/update-score`;
    const res = await postData<boolean, TaskUpdate>(apiUrl, req).then((res) => {
        return res.data
    });
    if (res != undefined) {
        return true
    } else {
        return false
    }
}


export interface CheckTaskResults {
    result: boolean,
    message: string,
}

interface SearchTaskReq {
    github_repo_id: number
}
export async function checkTask(repo: Repository, config: Config, maintainer: Maintainer) {
    var fail_res = {
        result: false,
        message: "",
    };

    const apiUrl = `${process.env.API_ENDPOINT}/task/search`;
    const req = {
        github_repo_id: repo.id,
        github_mentor_login: maintainer.id
    }
    const tasks: Task[] = await postData<Task[], SearchTaskReq>(apiUrl, req).then((res) => {
        return res.data
    });

    if (tasks.length >= maintainer.task) {
        fail_res.message = config.comment.task.userToomanyTask;
        return fail_res
    }

    return {
        result: true,
        message: "",
    }
}