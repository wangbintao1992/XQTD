import { _decorator, Color, Component, Graphics } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 把本节点下的路点（子节点）连成一条折线画出来，用来在运行时看清路径。
 * 只做可视化，不参与逻辑。
 */
@ccclass('PathRenderer')
export class PathRenderer extends Component {
    @property({ tooltip: '线宽' })
    public lineWidth = 6;

    @property({ type: Color, tooltip: '线颜色' })
    public lineColor = new Color(196, 60, 48, 170);

    protected onEnable(): void {
        this.redraw();
    }

    /** 按当前子节点位置重画折线。 */
    public redraw(): void {
        const graphics = this.getComponent(Graphics) || this.addComponent(Graphics);
        graphics.clear();

        const children = this.node.children;
        if (children.length < 2) {
            return;
        }

        graphics.lineWidth = this.lineWidth;
        graphics.strokeColor = this.lineColor;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.lineCap = Graphics.LineCap.ROUND;

        const first = children[0].position;
        graphics.moveTo(first.x, first.y);
        for (let i = 1; i < children.length; i += 1) {
            const point = children[i].position;
            graphics.lineTo(point.x, point.y);
        }
        graphics.stroke();
    }
}
