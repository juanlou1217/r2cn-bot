import { Context, Probot } from "probot";
import yaml from "js-yaml";
import * as Task from "./task.js";
import { R2CN, BotComment } from "./common.js";
import * as Student from "./student.js";
import { handle_mentor_cmd } from "./mentor.js";


export default (app: Probot) => {
    app.log.info(`api endpoint: ${process.env.API_ENDPOINT}`);
    // 删除issues.opend 事件避免重复消息
    app.on(["issues.labeled"], async (context) => {
        const label = context.payload.label;
        const labeled = label?.name.startsWith("r2cn-") && label?.name != "r2cn-complete";
        if (!labeled) {
            context.log.debug("Not R2cn score label, skipping message...")
            return
        }
        const config = await fetchConfig(context);
        if (config == null) {
            context.log.error("Config parsing error");
            return
        }

        const multi_label: boolean = (context.payload.issue.labels ?? []).filter(label => label.name.startsWith("r2cn-")).length > 1;
        if (multi_label) {
            await context.octokit.issues.createComment(context.issue({
                body: config.comment.task.multiScoreLabel,
            }));
            return
        }

        const repo_full_name = context.payload.repository.full_name;
        const repo = config.r2cn?.repos.find((repo) => repo.name === repo_full_name);
        if (!repo) {
            await context.octokit.issues.createComment(context.issue({
                body: config.comment.project.noneProjectComment,
            }));
            return
        }
        const creator = context.payload.issue.user.login;
        const maintainer = repo.maintainers.find(maintainer => maintainer.id === creator);
        if (!maintainer) {
            await context.octokit.issues.createComment(context.issue({
                body: config.comment.project.noneMaintainerComment,
            }));
            return
        }

        var scoreStr = label?.name.split('-')[1];
        var score = 0;
        if (scoreStr == undefined) {
            await context.octokit.issues.createComment(context.issue({
                body: config.comment.task.scoreUndefinedComment,
            }));
            return
        } else {
            score = parseInt(scoreStr)
        }

        if (score > maintainer.maxScore || score < 2) {
            await context.octokit.issues.createComment(context.issue({
                body: config.comment.task.scoreInvalidComment,
            }));
            return
        }

        const task = await Task.getTask(context.payload.issue.id);
        if (task == null) {
            const checkRes: Task.CheckTaskResults = await Task.checkTask(context.payload.repository, config, maintainer);
            if (checkRes.result) {
                const newTaskRes = await Task.newTask(context.payload.repository, context.payload.issue, score);
                if (newTaskRes) {
                    await context.octokit.issues.createComment(context.issue({
                        body: config.comment.task.success
                    }));
                }
            } else {
                await context.octokit.issues.createComment(context.issue({
                    body: checkRes.message
                }));
            }
        } else {
            if (task.task_status == Task.TaskStatus.Finished) {
                await context.octokit.issues.createComment(context.issue({
                    body: config.comment.task.notAllowedModify
                }));
            } else {
                // Update Task Score
                await Task.updateTaskScore(context.payload.issue, score);
                await context.octokit.issues.createComment(context.issue({
                    body: `${config.comment.task.successUpdate.trim()}: ${score}`
                }));

            }
        }
    });

    app.on(["issue_comment.created"], async (context) => {
        const config = await fetchConfig(context);
        if (context.isBot) {
            // context.log.debug("This comment was posted by a bot!");
            return
        }
        if (config == null) {
            context.log.error("Config parsing error");
            return
        }
        const command = context.payload.comment.body.trim();
        if (command.startsWith("/")) {
            const task = await Task.getTask(context.payload.issue.id);
            if (task == null) {
                await context.octokit.issues.createComment(context.issue({
                    body: config.comment.task.taskNotFound
                }));
            }
            if (command.startsWith("/request")) {
                let res = await Student.handle_stu_cmd(context, config, {
                    user: context.payload.comment.user, command, issue: context.payload.issue, task
                });
                context.octokit.issues.createComment(context.issue({
                    body: res.message
                }));
            } else if (command.startsWith("/intern")) {
                let res = await handle_mentor_cmd(context, config, {
                    user: context.payload.comment.user, command, issue: context.payload.issue, task
                });
                context.octokit.issues.createComment(context.issue({
                    body: res.message
                }));
            } else {
                context.octokit.issues.createComment(context.issue({
                    body: "错误的命令"
                }));
            }
        } else {
            context.log.debug("Normal Comment, skipping...")
        }
    });
};


async function fetchConfig(context: Context) {
    const r2cn_conf = await context.octokit.repos.getContent({
        owner: "r2cn-dev",
        repo: "r2cn",
        path: "r2cn.yaml",
    });
    let r2cn: R2CN | null = null;

    if ("type" in r2cn_conf.data && r2cn_conf.data.type === "file") {
        const content = Buffer.from(r2cn_conf.data.content || "", "base64").toString("utf8");
        r2cn = yaml.load(content) as R2CN;
    } else {
        context.log.error("Parsing r2cn.yaml failed.");
    }

    const repo = context.repo();
    const repo_full_name = `${repo.owner}/${repo.repo}`;
    const useEnglish = repo_full_name === "rustfs/rustfs";
    const comment_file = useEnglish ? "comment.en.yaml" : "comment.zh.yaml";

    const comment_conf = await context.octokit.repos.getContent({
        owner: "r2cn-dev",
        repo: "r2cn-bot",
        path: comment_file,
    });
    let comment: BotComment | null = null;

    if ("type" in comment_conf.data && comment_conf.data.type === "file") {
        const content = Buffer.from(comment_conf.data.content || "", "base64").toString("utf8");
        comment = yaml.load(content) as BotComment;
    } else {
        context.log.error(`Parsing ${comment_file} failed.`);
    }
    // 检查是否成功解析
    if (r2cn && comment) {
        return { comment, r2cn };
    } else {
        context.log.error("Failed to load Config. Either r2cn or comment is null.");
        return null;
    }
}
